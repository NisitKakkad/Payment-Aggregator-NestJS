import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';
import { Order } from '../orders/entities/order.entity.js';
import { PaymentsController } from './payments.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { SimulatedProviderService } from './providers/simulated-provider.service.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    AuthModule,
    WebhooksModule,
    BullModule.registerQueue({
  name: 'webhook-delivery',
}),
  ],
  providers: [PaymentsService, SimulatedProviderService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
