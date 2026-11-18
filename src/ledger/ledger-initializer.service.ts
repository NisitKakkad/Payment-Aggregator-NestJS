import { Injectable, OnModuleInit } from '@nestjs/common';

import { LedgerService } from './ledger.service.js';

@Injectable()
export class LedgerInitializerService implements OnModuleInit {
  constructor(private readonly ledgerService: LedgerService) {}

  async onModuleInit() {
    await this.ledgerService.createSystemAccounts();
  }
}
