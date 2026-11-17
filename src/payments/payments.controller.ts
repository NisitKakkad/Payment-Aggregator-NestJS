import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';

import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';
import { PaginationQueryDto } from '../orders/dto/pagination-query.dto.js';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: MerchantPayload,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.paymentsService.create(merchant.sub, dto, idempotencyKey);
  }
  @Get(':id')
  findOne(
    @CurrentMerchant() merchant: MerchantPayload,
    @Param('id') paymentId: string,
  ) {
    return this.paymentsService.findOne(merchant.sub, paymentId);
  }
  @Get()
  findAll(
    @CurrentMerchant() merchant: MerchantPayload,
    @Query() paginationDto: PaginationQueryDto,
  ) {
    return this.paymentsService.findAll(
      merchant.sub,
      paginationDto.page,
      paginationDto.limit,
    );
  }
}
