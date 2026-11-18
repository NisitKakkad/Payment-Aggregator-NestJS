import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Payment } from './entities/payment.entity.js';
import { PaymentsService } from './payments.service.js';
import { Order } from '../orders/entities/order.entity.js';
import { PaymentsController } from './payments.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { SimulatedProviderService } from './providers/simulated-provider.service.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order]),
    AuthModule,
    OutboxModule,
    LedgerModule,
  ],
  providers: [PaymentsService, SimulatedProviderService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
