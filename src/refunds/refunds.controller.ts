import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  Query,
} from '@nestjs/common';

import { RefundsService } from './refunds.service.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';
import { RefundPaginationQueryDto } from './dto/refund-pagination-query.dto.js';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: MerchantPayload,
    @Body() dto: CreateRefundDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.refundsService.create(merchant.sub, dto, idempotencyKey);
  }

  @Get()
  findAll(
    @CurrentMerchant() merchant: MerchantPayload,
    @Query() query: RefundPaginationQueryDto,
  ) {
    return this.refundsService.findAll(merchant.sub, query.page, query.limit);
  }

  @Get(':id')
  findOne(
    @CurrentMerchant() merchant: MerchantPayload,
    @Param('id') refundId: string,
  ) {
    return this.refundsService.findOne(merchant.sub, refundId);
  }
}
