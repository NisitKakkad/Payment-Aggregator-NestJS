import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';

import { LedgerService } from './ledger.service.js';

import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto.js';
import { PostLedgerJournalDto } from './dto/post-ledger-journal.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';
import { LedgerPaginationDto } from './dto/ledger-pagination.dto.js';
import { UpdateLedgerAccountStatusDto } from './dto/update-ledger-account-status.dto.js';
import { LedgerJournalFilterDto } from './dto/ledger-journal-filter.dto.js';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('accounts')
  createAccount(
    @CurrentMerchant() merchant: { sub: string },
    @Body() dto: CreateLedgerAccountDto,
  ) {
    return this.ledgerService.createAccount(
      merchant.sub,
      dto.name,
      dto.code,
      dto.type,
      dto.currency,
    );
  }

  @Post('journals')
  postJournal(
    @CurrentMerchant() merchant: { sub: string },
    @Body() dto: PostLedgerJournalDto,
  ) {
    return this.ledgerService.postJournal({
      merchantId: merchant.sub,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      currency: dto.currency,
      description: dto.description,
      entries: dto.entries,
    });
  }

  @Get('accounts/:id/balance')
  getAccountBalance(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    return this.ledgerService.getAccountBalance(accountId, merchant.sub);
  }

  @Get('accounts')
  findAllAccounts(
    @CurrentMerchant() merchant: { sub: string },
    @Query() pagination: LedgerPaginationDto,
  ) {
    return this.ledgerService.findAllAccounts(
      merchant.sub,
      pagination.page,
      pagination.limit,
    );
  }

  @Get('journals')
  findAllJournals(
    @CurrentMerchant() merchant: { sub: string },
    @Query() pagination: LedgerPaginationDto,
    @Query() filters: LedgerJournalFilterDto,
  ) {
    return this.ledgerService.findAllJournals(
      merchant.sub,
      pagination.page,
      pagination.limit,
      filters,
    );
  }

  @Post('journals/:id/reverse')
  reverseJournal(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) journalId: string,
  ) {
    return this.ledgerService.reverseJournal(journalId, merchant.sub);
  }
  @Get('accounts/:id/statement')
  getAccountStatement(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ledgerService.getAccountStatement(
      accountId,
      merchant.sub,
      from,
      to,
    );
  }
  @Get('journals/:id')
  getJournalById(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) journalId: string,
  ) {
    return this.ledgerService.getJournalById(journalId, merchant.sub);
  }
  @Patch('accounts/:id/status')
  updateAccountStatus(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body() dto: UpdateLedgerAccountStatusDto,
  ) {
    return this.ledgerService.updateAccountStatus(
      accountId,
      merchant.sub,
      dto.status,
    );
  }
  @Delete('accounts/:id')
  deactivateAccount(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) accountId: string,
  ) {
    return this.ledgerService.deactivateAccount(accountId, merchant.sub);
  }
}
