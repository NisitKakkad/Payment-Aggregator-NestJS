import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Refund } from './entities/refund.entity.js';

import { RefundsController } from './refunds.controller.js';
import { RefundsService } from './refunds.service.js';

import { AuthModule } from '../auth/auth.module.js';
import { SimulatedRefundProviderService } from './providers/simulated-refund-provider.service.js';
import { OutboxModule } from '../outbox/outbox.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Refund]),
    AuthModule,
    OutboxModule,
    LedgerModule,
  ],
  controllers: [RefundsController],
  providers: [RefundsService, SimulatedRefundProviderService],
  exports: [RefundsService],
})
export class RefundsModule {}
