import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReconciliationRun } from './entities/reconciliation-run.entity.js';
import { ExternalPayoutRecord } from './entities/external-payout-record.entity.js';
import { ReconciliationDiscrepancy } from './entities/reconciliation-discrepancy.entity.js';
import { Settlement } from '../settlements/entities/settlements.entity.js';
import { ReconciliationController } from './reconciliation.controller.js';
import { ReconciliationService } from './reconciliation.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReconciliationRun,
      ExternalPayoutRecord,
      ReconciliationDiscrepancy,
      Settlement,
    ]),
    AuthModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
