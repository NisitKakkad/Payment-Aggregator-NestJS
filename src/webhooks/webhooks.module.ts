import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './entities/webhook.entity.js';
import { WebhookSignatureService } from './webhook-signature.service.js';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { BullModule } from '@nestjs/bullmq';
import { WebhookProcessor } from './webhooks.processor.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook]), MerchantsModule, BullModule.registerQueue({
  name: 'webhook-delivery',
}),AuthModule],
  providers: [WebhooksService, WebhookSignatureService, WebhookProcessor],
  controllers: [WebhooksController],
  exports: [WebhooksService, WebhookSignatureService],
})
export class WebhooksModule {}
