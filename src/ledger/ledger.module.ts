
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerAccount } from './entities/ledger-account.entity.js';
import { LedgerEntry } from './entities/ledger-entry.entity.js';
import { LedgerService } from './ledger.service.js';
import { LedgerJournal } from './entities/ledger-journal.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerController } from './ledger.controller.js';
import { LedgerInitializerService } from './ledger-initializer.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LedgerAccount,
      LedgerEntry,
      LedgerJournal,
    ]),
    AuthModule
  ],
  providers:[LedgerService,
    LedgerInitializerService
  ],
  controllers:[LedgerController],
  exports:[LedgerService]
})
export class LedgerModule {}
