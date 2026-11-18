import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Settlement } from './entities/settlements.entity.js';
import { SettlementItem } from './entities/settlements-item.entity.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';
import { SimulatedPayoutProviderService } from './providers/simulated-payout-provider.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { Merchant } from '../merchants/entities/merchant.entity.js';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity.js';
import { OutboxModule } from '../outbox/outbox.module.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Settlement,
      SettlementItem,
      Merchant,
      LedgerEntry,
    ]),
    AuthModule,
    LedgerModule,
    OutboxModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, SimulatedPayoutProviderService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
