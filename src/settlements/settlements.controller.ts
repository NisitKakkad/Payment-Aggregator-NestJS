import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service.js';
import { CreateSettlementDto } from './dto/create-settlement.dto.js';
import { SettlementPaginationDto } from './dto/settlement-pagination.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';

@Controller('settlements')
@UseGuards(JwtAuthGuard)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('balance')
  getAvailableBalance(@CurrentMerchant() merchant: { sub: string }) {
    return this.settlementsService.getAvailableBalance(merchant.sub);
  }

  @Post()
  create(
    @CurrentMerchant() merchant: { sub: string },
    @Body() dto: CreateSettlementDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('Idempotency-Key header is required');
    return this.settlementsService.create(merchant.sub, dto, idempotencyKey);
  }

  @Get()
  findAll(
    @CurrentMerchant() merchant: { sub: string },
    @Query() pagination: SettlementPaginationDto,
  ) {
    return this.settlementsService.findAll(
      merchant.sub,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  findOne(
    @CurrentMerchant() merchant: { sub: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.settlementsService.findOne(merchant.sub, id);
  }
}
