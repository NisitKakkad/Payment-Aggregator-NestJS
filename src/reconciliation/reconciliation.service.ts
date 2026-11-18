import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, QueryFailedError, Repository } from 'typeorm';

import {
  ReconciliationRun,
  ReconciliationRunStatus,
} from './entities/reconciliation-run.entity.js';

import {
  ExternalPayoutRecord,
  ExternalPayoutRecordStatus,
} from './entities/external-payout-record.entity.js';

import {
  ReconciliationDiscrepancy,
  ReconciliationDiscrepancyType,
  ReconciliationDiscrepancyStatus,
} from './entities/reconciliation-discrepancy.entity.js';

import {
  Settlement,
  SettlementStatus,
} from '../settlements/entities/settlements.entity.js';

import { ImportPayoutsDto } from './dto/import-payouts.dto.js';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(ReconciliationRun)
    private readonly runRepository: Repository<ReconciliationRun>,

    private readonly dataSource: DataSource,
  ) {}

  async importPayouts(merchantId: string, dto: ImportPayoutsDto) {
    if (
      dto.periodStart &&
      dto.periodEnd &&
      new Date(dto.periodStart) > new Date(dto.periodEnd)
    ) {
      throw new BadRequestException('periodStart cannot be after periodEnd');
    }

    const references = dto.records.map((record) => record.externalReference);

    if (new Set(references).size !== references.length) {
      throw new BadRequestException(
        'The uploaded statement contains duplicate externalReference values',
      );
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const runRepo = manager.getRepository(ReconciliationRun);
        const recordRepo = manager.getRepository(ExternalPayoutRecord);
        const discrepancyRepo = manager.getRepository(
          ReconciliationDiscrepancy,
        );
        const settlementRepo = manager.getRepository(Settlement);

        const run = await runRepo.save(
          runRepo.create({
            merchantId,
            status: ReconciliationRunStatus.COMPLETED,
            totalRecords: dto.records.length,
            matchedRecords: 0,
            discrepancyCount: 0,
            totalExternalAmount: '0',
            periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
            periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
          }),
        );

        let matchedRecords = 0;
        let discrepancyCount = 0;
        let totalExternalAmount = 0n;

        const matchedSettlementIds = new Set<string>();

        for (const input of dto.records) {
          totalExternalAmount += BigInt(input.amount);

          const settlement = await settlementRepo.findOne({
            where: {
              merchantId,
              payoutReference: input.externalReference,
              status: SettlementStatus.SUCCESS,
            },
          });

          let recordStatus = ExternalPayoutRecordStatus.UNMATCHED;

          let discrepancyType: ReconciliationDiscrepancyType | null = null;

          let description = '';
          let expectedAmount: string | null = null;
          let settlementId: string | null = null;

          if (!settlement) {
            discrepancyType =
              ReconciliationDiscrepancyType.UNMATCHED_EXTERNAL_RECORD;

            description = `External payout ${input.externalReference} has no matching successful PayFlow settlement`;
          } else {
            settlementId = settlement.id;
            matchedSettlementIds.add(settlement.id);

            if (
              settlement.amount !== input.amount ||
              settlement.currency !== input.currency
            ) {
              recordStatus = ExternalPayoutRecordStatus.AMOUNT_MISMATCH;

              discrepancyType = ReconciliationDiscrepancyType.AMOUNT_MISMATCH;

              expectedAmount = settlement.amount;

              description = `External payout ${input.externalReference} does not match the PayFlow settlement amount or currency`;
            } else {
              recordStatus = ExternalPayoutRecordStatus.MATCHED;
              matchedRecords += 1;
            }
          }

          const record = await recordRepo.save(
            recordRepo.create({
              runId: run.id,
              merchantId,
              externalReference: input.externalReference,
              amount: input.amount,
              currency: input.currency,
              transactionDate: new Date(input.transactionDate),
              settlementId,
              status: recordStatus,
            }),
          );

          if (discrepancyType) {
            discrepancyCount += 1;

            await discrepancyRepo.save(
              discrepancyRepo.create({
                runId: run.id,
                externalPayoutRecordId: record.id,
                settlementId,
                type: discrepancyType,
                description,
                expectedAmount,
                actualAmount: input.amount,
                status: ReconciliationDiscrepancyStatus.OPEN,
              }),
            );
          }
        }

        // Find successful settlements missing from the external statement.
        const missingQuery = settlementRepo
          .createQueryBuilder('settlement')
          .where('settlement.merchantId = :merchantId', {
            merchantId,
          })
          .andWhere('settlement.status = :status', {
            status: SettlementStatus.SUCCESS,
          });

        if (dto.periodStart) {
          missingQuery.andWhere('settlement.processedAt >= :periodStart', {
            periodStart: new Date(dto.periodStart),
          });
        }

        if (dto.periodEnd) {
          missingQuery.andWhere('settlement.processedAt <= :periodEnd', {
            periodEnd: new Date(dto.periodEnd),
          });
        }

        const successfulSettlements = await missingQuery.getMany();

        for (const settlement of successfulSettlements) {
          if (
            settlement.payoutReference &&
            !matchedSettlementIds.has(settlement.id) &&
            !references.includes(settlement.payoutReference)
          ) {
            discrepancyCount += 1;

            await discrepancyRepo.save(
              discrepancyRepo.create({
                runId: run.id,
                externalPayoutRecordId: null,
                settlementId: settlement.id,
                type: ReconciliationDiscrepancyType.MISSING_EXTERNAL_RECORD,
                description: `Successful PayFlow settlement ${settlement.id} is missing from the uploaded external statement`,
                expectedAmount: settlement.amount,
                actualAmount: null,
                status: ReconciliationDiscrepancyStatus.OPEN,
              }),
            );
          }
        }

        // Update reconciliation summary.
        run.matchedRecords = matchedRecords;
        run.discrepancyCount = discrepancyCount;
        run.totalExternalAmount = totalExternalAmount.toString();

        run.status =
          discrepancyCount > 0
            ? ReconciliationRunStatus.COMPLETED_WITH_DISCREPANCIES
            : ReconciliationRunStatus.COMPLETED;

        await runRepo.save(run);

        return {
          ...run,
          summary: {
            totalRecords: run.totalRecords,
            matchedRecords,
            discrepancyCount,
            totalExternalAmount: run.totalExternalAmount,
          },
          records: await recordRepo.find({
            where: { runId: run.id },
            order: { createdAt: 'ASC' },
          }),
          discrepancies: await discrepancyRepo.find({
            where: { runId: run.id },
            order: { createdAt: 'ASC' },
          }),
        };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (
          error as QueryFailedError & {
            driverError?: { code?: string };
          }
        ).driverError?.code === '23505'
      ) {
        throw new BadRequestException(
          'An external payout reference has already been imported for this merchant',
        );
      }

      throw error;
    }
  }

  async findAll(merchantId: string, page = 1, limit = 10) {
    const [data, total] = await this.runRepository.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(merchantId: string, runId: string) {
    const run = await this.runRepository.findOne({
      where: {
        id: runId,
        merchantId,
      },
      relations: {
        records: true,
        discrepancies: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Reconciliation run not found');
    }

    return run;
  }

  async resolveDiscrepancy(merchantId: string, discrepancyId: string) {
    return this.dataSource.transaction(async (manager) => {
      const discrepancyRepo = manager.getRepository(ReconciliationDiscrepancy);

      const runRepo = manager.getRepository(ReconciliationRun);

      // Find and lock the discrepancy.
      const discrepancy = await discrepancyRepo.findOne({
        where: {
          id: discrepancyId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!discrepancy) {
        throw new NotFoundException('Reconciliation discrepancy not found');
      }

      // Find and lock the parent run, verifying merchant ownership.
      const run = await runRepo.findOne({
        where: {
          id: discrepancy.runId,
          merchantId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!run) {
        throw new NotFoundException('Reconciliation discrepancy not found');
      }

      // Mark the discrepancy as resolved.
      discrepancy.status = ReconciliationDiscrepancyStatus.RESOLVED;

      await discrepancyRepo.save(discrepancy);

      // Recalculate the remaining open discrepancies.
      const openDiscrepancyCount = await discrepancyRepo.count({
        where: {
          runId: run.id,
          status: ReconciliationDiscrepancyStatus.OPEN,
        },
      });

      // Update the parent reconciliation run.
      run.discrepancyCount = openDiscrepancyCount;

      run.status =
        openDiscrepancyCount > 0
          ? ReconciliationRunStatus.COMPLETED_WITH_DISCREPANCIES
          : ReconciliationRunStatus.COMPLETED;

      await runRepo.save(run);

      return {
        message: 'Discrepancy resolved successfully',

        discrepancy,

        reconciliationRun: {
          id: run.id,
          status: run.status,
          discrepancyCount: run.discrepancyCount,
        },
      };
    });
  }
}
