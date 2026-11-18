import {
  Controller, Post, Get, Body, Param, Query, Patch,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service.js';
import { ImportPayoutsDto } from './dto/import-payouts.dto.js';
import { ReconciliationPaginationDto } from './dto/reconciliation-pagination.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('import')
  importPayouts(
    @CurrentMerchant() merchant: { sub: string },
    @Body() dto: ImportPayoutsDto,
  ) {
    return this.reconciliationService.importPayouts(merchant.sub, dto);
  }

  @Get('runs')
  findAll(
    @CurrentMerchant() merchant: { sub: string },
    @Query() pagination: ReconciliationPaginationDto,
  ) {
    return this.reconciliationService.findAll(merchant.sub, pagination.page, pagination.limit);
  }

  @Get('runs/:id')
  findOne(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliationService.findOne(merchant.sub, id);
  }

  @Patch('discrepancies/:id/resolve')
  resolveDiscrepancy(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliationService.resolveDiscrepancy(merchant.sub, id);
  }

}
