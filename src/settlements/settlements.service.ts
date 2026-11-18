import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { Settlement, SettlementStatus } from './entities/settlements.entity.js';
import { SettlementItem } from './entities/settlements-item.entity.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { Merchant } from '../merchants/entities/merchant.entity.js';
import {
  LedgerEntry,
  LedgerEntryType,
} from '../ledger/entities/ledger-entry.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { SimulatedPayoutProviderService } from './providers/simulated-payout-provider.service.js';
import { CreateSettlementDto } from './dto/create-settlement.dto.js';

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementRepository: Repository<Settlement>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly payoutProvider: SimulatedPayoutProviderService,
    private readonly outboxService: OutboxService,
  ) {}

  async create(
    merchantId: string,
    dto: CreateSettlementDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (idempotencyKey.length > 100) {
      throw new BadRequestException(
        'Idempotency-Key cannot exceed 100 characters',
      );
    }

    let settlement: Settlement;
    let shouldProcessPayout = false;

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        // Serialize settlement creation for this merchant. This prevents concurrent
        // requests from reserving the same payable balance.
        const merchant = await manager
          .getRepository(Merchant)
          .createQueryBuilder('merchant')
          .setLock('pessimistic_write')
          .where('merchant.id = :merchantId', { merchantId })
          .getOne();

        if (!merchant) throw new NotFoundException('Merchant not found');

        const settlementRepo = manager.getRepository(Settlement);
        const existing = await settlementRepo.findOne({
          where: { merchantId, idempotencyKey },
          relations: { items: true },
        });
        if (existing) return { settlement: existing, created: false };

        const payable = await this.getNetPayable(manager, merchantId);
        const reservedRaw = await settlementRepo
          .createQueryBuilder('settlement')
          .select(
            'COALESCE(SUM(CAST(settlement.amount AS NUMERIC)), 0)',
            'reserved',
          )
          .where('settlement.merchantId = :merchantId', { merchantId })
          .andWhere('settlement.status IN (:...statuses)', {
            statuses: [SettlementStatus.PENDING, SettlementStatus.PROCESSING],
          })
          .getRawOne<{ reserved: string }>();

        const available =
          BigInt(payable) - BigInt(reservedRaw?.reserved ?? '0');
        if (available <= 0n) {
          throw new ConflictException(
            'There is no available merchant payable balance to settle',
          );
        }

        const amount = dto.amount ? BigInt(dto.amount) : available;
        if (amount <= 0n)
          throw new BadRequestException('Settlement amount must be positive');
        if (amount > available) {
          throw new ConflictException(
            `Requested amount exceeds available settlement balance of ${available.toString()} paise`,
          );
        }

        const created = settlementRepo.create({
          merchantId,
          amount: amount.toString(),
          currency: 'INR',
          status: SettlementStatus.PROCESSING,
          payoutReference: null,
          idempotencyKey,
          failureReason: null,
          processedAt: null,
        });
        const saved = await settlementRepo.save(created);

        await manager.getRepository(SettlementItem).save(
          manager.getRepository(SettlementItem).create({
            settlementId: saved.id,
            itemType: 'NET_MERCHANT_PAYABLE',
            amount: amount.toString(),
            currency: 'INR',
            description:
              'Ledger-derived net merchant payable reserved for payout',
          }),
        );

        return { settlement: saved, created: true };
      });
      settlement = result.settlement;
      shouldProcessPayout = result.created;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        const existing = await this.settlementRepository.findOne({
          where: { merchantId, idempotencyKey },
          relations: { items: true },
        });
        if (existing) return existing;
        throw new ConflictException(
          'A settlement with this idempotency key already exists',
        );
      }
      throw error;
    }

    // A previously completed idempotent request must not trigger another payout.
    if (!shouldProcessPayout) {
      return this.findOne(merchantId, settlement.id);
    }

    const payout = await this.payoutProvider.processPayout({
      settlementId: settlement.id,
      amount: settlement.amount,
      currency: settlement.currency,
    });

    if (!payout.success || !payout.providerReference) {
      settlement.status = SettlementStatus.FAILED;
      settlement.failureReason =
        payout.failureReason ?? 'Simulated payout failed';
      settlement.processedAt = new Date();
      await this.settlementRepository.save(settlement);
      return this.findOne(merchantId, settlement.id);
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        const settlementRepo = manager.getRepository(Settlement);
        const locked = await settlementRepo.findOne({
          where: { id: settlement.id, merchantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Settlement not found');
        if (locked.status === SettlementStatus.SUCCESS) return;

        const payable = await this.ledgerService.getSystemAccountByCode(
          'MERCHANT_PAYABLE',
          manager,
        );
        const clearing = await this.ledgerService.getSystemAccountByCode(
          'PAYMENT_CLEARING',
          manager,
        );

        await this.ledgerService.postJournal(
          {
            merchantId,
            referenceType: 'SETTLEMENT',
            referenceId: locked.id,
            currency: locked.currency,
            description: `Merchant payout settlement ${locked.id}`,
            entries: [
              {
                accountId: payable.id,
                type: LedgerEntryType.DEBIT,
                amount: locked.amount,
              },
              {
                accountId: clearing.id,
                type: LedgerEntryType.CREDIT,
                amount: locked.amount,
              },
            ],
          },
          manager,
        );

        locked.status = SettlementStatus.SUCCESS;
        locked.payoutReference = payout.providerReference;
        locked.failureReason = null;
        locked.processedAt = new Date();
        await settlementRepo.save(locked);

        await this.outboxService.createEvent(manager, {
          event: 'settlement.processed',
          aggregateType: 'SETTLEMENT',
          aggregateId: locked.id,
          merchantId,
          payload: {
            event: 'settlement.processed',
            settlement: {
              id: locked.id,
              amount: locked.amount,
              currency: locked.currency,
              status: locked.status,
              payoutReference: locked.payoutReference,
              processedAt: locked.processedAt,
            },
          },
        });
      });
    } catch (error) {
      // The simulated provider may have returned success while local accounting failed.
      // Keep the settlement reserved for investigation rather than falsely releasing it.
      const latest = await this.settlementRepository.findOne({
        where: { id: settlement.id },
      });
      if (latest && latest.status !== SettlementStatus.SUCCESS) {
        latest.status = SettlementStatus.PROCESSING;
        latest.failureReason =
          error instanceof Error
            ? error.message
            : 'Settlement accounting finalization failed';
        await this.settlementRepository.save(latest);
      }
      throw new InternalServerErrorException(
        'Payout was accepted by the simulated provider but ledger finalization failed; settlement remains processing',
      );
    }

    return this.findOne(merchantId, settlement.id);
  }

  private async getNetPayable(
    manager: EntityManager,
    merchantId: string,
  ): Promise<string> {
    const result = await manager
      .getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoin('entry.journal', 'journal')
      .innerJoin('entry.account', 'account')
      .select(
        `
        COALESCE(SUM(
          CASE
            WHEN entry.type = :credit THEN CAST(entry.amount AS NUMERIC)
            WHEN entry.type = :debit THEN -CAST(entry.amount AS NUMERIC)
            ELSE 0
          END
        ), 0)
      `,
        'balance',
      )
      .where('journal.merchantId = :merchantId', { merchantId })
      .andWhere('account.code = :code', { code: 'MERCHANT_PAYABLE' })
      .andWhere('account.merchantId IS NULL')
      .setParameters({
        credit: LedgerEntryType.CREDIT,
        debit: LedgerEntryType.DEBIT,
      })
      .getRawOne<{ balance: string }>();
    return result?.balance ?? '0';
  }

  async findAll(merchantId: string, page = 1, limit = 10) {
    const [data, total] = await this.settlementRepository.findAndCount({
      where: { merchantId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(merchantId: string, settlementId: string) {
    const settlement = await this.settlementRepository.findOne({
      where: { id: settlementId, merchantId },
      relations: { items: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return settlement;
  }

  async getAvailableBalance(merchantId: string) {
    const payable = await this.getNetPayable(
      this.dataSource.manager,
      merchantId,
    );
    const reserved = await this.settlementRepository
      .createQueryBuilder('settlement')
      .select(
        'COALESCE(SUM(CAST(settlement.amount AS NUMERIC)), 0)',
        'reserved',
      )
      .where('settlement.merchantId = :merchantId', { merchantId })
      .andWhere('settlement.status IN (:...statuses)', {
        statuses: [SettlementStatus.PENDING, SettlementStatus.PROCESSING],
      })
      .getRawOne<{ reserved: string }>();
    const available = BigInt(payable) - BigInt(reserved?.reserved ?? '0');
    return {
      currency: 'INR',
      ledgerPayable: payable,
      reserved: reserved?.reserved ?? '0',
      available: (available > 0n ? available : 0n).toString(),
    };
  }
}
