import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { Refund, RefundStatus } from './entities/refund.entity.js';

import { Payment, PaymentStatus } from '../payments/entities/payment.entity.js';

import { CreateRefundDto } from './dto/create-refund.dto.js';

import {
  SimulatedRefundProviderService,
  ProviderRefundStatus,
} from './providers/simulated-refund-provider.service.js';

import { OutboxService } from '../outbox/outbox.service.js';

import { LedgerService } from '../ledger/ledger.service.js';

import { LedgerEntryType } from '../ledger/entities/ledger-entry.entity.js';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,

    private readonly dataSource: DataSource,

    private readonly refundProvider: SimulatedRefundProviderService,

    private readonly outboxService: OutboxService,

    private readonly ledgerService: LedgerService,
  ) {}

  async create(
    merchantId: string,
    dto: CreateRefundDto,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existingRefund = await this.refundRepository.findOne({
      where: { idempotencyKey },
      relations: { payment: { order: true } },
    });

    if (existingRefund) {
      if (
        existingRefund.payment.order.merchantId !== merchantId ||
        existingRefund.paymentId !== dto.paymentId ||
        Number(existingRefund.amount) !== dto.amount
      ) {
        throw new ConflictException(
          'Idempotency key already used for a different refund request',
        );
      }

      return existingRefund;
    }

    let refund: Refund;

    try {
      refund = await this.dataSource.transaction(async (manager) => {
        const paymentRepo = manager.getRepository(Payment);
        const refundRepo = manager.getRepository(Refund);

        const payment = await paymentRepo
          .createQueryBuilder('payment')
          .innerJoinAndSelect('payment.order', 'order')
          .where('payment.id = :paymentId', {
            paymentId: dto.paymentId,
          })
          .andWhere('order.merchantId = :merchantId', {
            merchantId,
          })
          .setLock('pessimistic_write')
          .getOne();

        if (!payment) {
          throw new NotFoundException('Payment not found');
        }

        if (payment.status !== PaymentStatus.SUCCESS) {
          throw new ConflictException(
            'Only successful payments can be refunded',
          );
        }

        const refunds = await refundRepo.find({
          where: [
            { paymentId: payment.id, status: RefundStatus.PENDING },
            { paymentId: payment.id, status: RefundStatus.PROCESSING },
            { paymentId: payment.id, status: RefundStatus.SUCCESS },
          ],
        });

        const alreadyRefunded = refunds.reduce(
          (total, item) => total + BigInt(item.amount),
          0n,
        );

        const availableAmount = BigInt(payment.amount) - alreadyRefunded;

        const refundAmount = BigInt(dto.amount);

        if (refundAmount > availableAmount) {
          throw new ConflictException(
            'Refund amount exceeds the available refundable balance',
          );
        }

        const newRefund = refundRepo.create({
          paymentId: payment.id,
          amount: refundAmount.toString(),
          currency: payment.currency,
          status: RefundStatus.PROCESSING,
          idempotencyKey,
        });

        return refundRepo.save(newRefund);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === '23505'
      ) {
        const duplicate = await this.refundRepository.findOne({
          where: { idempotencyKey },
        });

        if (duplicate) {
          if (
            duplicate.paymentId !== dto.paymentId ||
            Number(duplicate.amount) !== dto.amount
          ) {
            throw new ConflictException(
              'Idempotency key already used for a different refund request',
            );
          }

          return duplicate;
        }
      }

      throw error;
    }

    // Process the refund with the simulated provider.
    let result;

    try {
      result = await this.refundProvider.processRefund();
    } catch (error) {
      refund.status = RefundStatus.FAILED;

      await this.persistRefundResult(refund, merchantId);

      throw error;
    }

    refund.providerRefundReference = result.providerRefundReference;

    refund.status =
      result.status === ProviderRefundStatus.SUCCESS
        ? RefundStatus.SUCCESS
        : RefundStatus.FAILED;

    return this.persistRefundResult(refund, merchantId);
  }

  async findOne(merchantId: string, refundId: string) {
    const refund = await this.refundRepository.findOne({
      where: {
        id: refundId,
        payment: {
          order: {
            merchantId,
          },
        },
      },
      relations: {
        payment: {
          order: true,
        },
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      providerRefundReference: refund.providerRefundReference,
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
    };
  }

  async findAll(merchantId: string, page: number, limit: number) {
    const [refunds, total] = await this.refundRepository.findAndCount({
      where: {
        payment: {
          order: {
            merchantId,
          },
        },
      },
      relations: {
        payment: {
          order: true,
        },
      },
      select: {
        id: true,
        paymentId: true,
        amount: true,
        currency: true,
        status: true,
        providerRefundReference: true,
        createdAt: true,
        updatedAt: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: refunds,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async persistRefundResult(refund: Refund, merchantId: string) {
    return this.dataSource.transaction(async (manager) => {
      const refundRepository = manager.getRepository(Refund);

      const savedRefund = await refundRepository.save(refund);

      // Create ledger entries only for successful refunds.
      if (savedRefund.status === RefundStatus.SUCCESS) {
        const merchantPayable = await this.ledgerService.getSystemAccountByCode(
          'MERCHANT_PAYABLE',
          manager,
        );

        const refundClearing = await this.ledgerService.getSystemAccountByCode(
          'REFUND_CLEARING',
          manager,
        );

        await this.ledgerService.postJournal(
          {
            merchantId,
            referenceType: 'REFUND',
            referenceId: savedRefund.id,
            currency: savedRefund.currency,
            description: `Successful refund ${savedRefund.id}`,
            entries: [
              {
                accountId: merchantPayable.id,
                type: LedgerEntryType.DEBIT,
                amount: savedRefund.amount,
              },
              {
                accountId: refundClearing.id,
                type: LedgerEntryType.CREDIT,
                amount: savedRefund.amount,
              },
            ],
          },
          manager,
        );
      }

      const event =
        savedRefund.status === RefundStatus.SUCCESS
          ? 'refund.processed'
          : 'refund.failed';

      await this.outboxService.createEvent(manager, {
        event,
        aggregateType: 'REFUND',
        aggregateId: savedRefund.id,
        merchantId,
        payload: {
          refundId: savedRefund.id,
          paymentId: savedRefund.paymentId,
          amount: savedRefund.amount,
          currency: savedRefund.currency,
          status: savedRefund.status,
          providerRefundReference: savedRefund.providerRefundReference,
        },
      });

      return savedRefund;
    });
  }
}
