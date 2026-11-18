import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { OutboxEvent } from './entities/outbox-event.entity.js';
import { Webhook } from '../webhooks/entities/webhook.entity.js';

import { OutboxService } from './outbox.service.js';
import { OutboxProcessorService } from './outbox-processor.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, Webhook]),

    BullModule.registerQueue({
      name: 'webhook-delivery',
    }),
  ],
  providers: [OutboxService, OutboxProcessorService],
  exports: [OutboxService],
})
export class OutboxModule {}
