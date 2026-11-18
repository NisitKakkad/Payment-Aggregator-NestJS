import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Interval } from '@nestjs/schedule';

import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';

import {
  OutboxEvent,
  OutboxEventStatus,
} from './entities/outbox-event.entity.js';

import { Webhook, WebhookStatus } from '../webhooks/entities/webhook.entity.js';

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly maxAttempts = 10;
  private readonly staleAfterMs = 60_000;

  private isPolling = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,

    private readonly dataSource: DataSource,

    @InjectQueue('webhook-delivery')
    private readonly webhookQueue: Queue,
  ) {}

  @Interval(5000)
  async processPendingEvents() {
    if (this.isPolling) return;

    this.isPolling = true;

    try {
      const staleBefore = new Date(Date.now() - this.staleAfterMs);

      const events = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(OutboxEvent);

        const eligibleEvents = await repository
          .createQueryBuilder('event')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where(
            `(
                event.status = :pending
                OR (
                  event.status = :processing
                  AND event.updatedAt < :staleBefore
                )
              )`,
            {
              pending: OutboxEventStatus.PENDING,
              processing: OutboxEventStatus.PROCESSING,
              staleBefore,
            },
          )
          .orderBy('event.createdAt', 'ASC')
          .take(10)
          .getMany();

        const eventsToProcess: OutboxEvent[] = [];

        for (const event of eligibleEvents) {
          if (event.attempts >= this.maxAttempts) {
            event.status = OutboxEventStatus.FAILED;
            event.lastError = 'Maximum dispatch attempts exceeded';
            continue;
          }

          event.status = OutboxEventStatus.PROCESSING;
          event.attempts += 1;

          eventsToProcess.push(event);
        }

        await repository.save(eligibleEvents);

        return eventsToProcess;
      });

      for (const event of events) {
        await this.dispatchEvent(event.id);
      }
    } catch (error) {
      this.logger.error('Outbox polling failed', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async dispatchEvent(eventId: string) {
    try {
      const webhook = await this.dataSource.transaction(async (manager) => {
        const outboxRepo = manager.getRepository(OutboxEvent);
        const webhookRepo = manager.getRepository(Webhook);

        const event = await outboxRepo.findOne({
          where: { id: eventId },
        });

        if (!event) {
          throw new Error('Outbox event not found');
        }

        let webhook: Webhook;

        if (event.webhookId) {
          const existing = await webhookRepo.findOne({
            where: { id: event.webhookId },
          });

          if (!existing) {
            throw new Error('Associated webhook record not found');
          }

          webhook = existing;
        } else {
          const paymentId =
            event.aggregateType === 'PAYMENT'
              ? event.aggregateId
              : event.payload.paymentId;

          if (!paymentId) {
            throw new Error('Payment ID missing from outbox event');
          }

          webhook = webhookRepo.create({
            merchantId: event.merchantId,
            paymentId,
            event: event.event,
            payload: event.payload,
            status: WebhookStatus.PENDING,
            attempts: 0,
          });

          webhook = await webhookRepo.save(webhook);

          event.webhookId = webhook.id;
          await outboxRepo.save(event);
        }

        return webhook;
      });

      await this.webhookQueue.add(
        'deliver-webhook',
        { webhookId: webhook.id },
        {
          jobId: `outbox-${eventId}`,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        },
      );

      await this.outboxRepository.update(eventId, {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const event = await this.outboxRepository.findOne({
        where: { id: eventId },
      });

      if (!event) return;

      await this.outboxRepository.update(eventId, {
        status:
          event.attempts >= this.maxAttempts
            ? OutboxEventStatus.FAILED
            : OutboxEventStatus.PENDING,
        lastError: message,
      });

      this.logger.error(
        `Failed to dispatch outbox event ${eventId}: ${message}`,
      );
    }
  }
}
