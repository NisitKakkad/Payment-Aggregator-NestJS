import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';

import {
  OutboxEvent,
  OutboxEventStatus,
} from './entities/outbox-event.entity.js';

interface CreateOutboxEventInput {
  event: string;
  aggregateType: string;
  aggregateId: string;
  merchantId: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboxService {
  async createEvent(manager: EntityManager, input: CreateOutboxEventInput) {
    const repository = manager.getRepository(OutboxEvent);

    const outboxEvent = repository.create({
      eventId: randomUUID(),
      event: input.event,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      merchantId: input.merchantId,
      payload: input.payload,
      status: OutboxEventStatus.PENDING,
    });

    return repository.save(outboxEvent);
  }
}
