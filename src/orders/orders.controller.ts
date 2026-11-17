import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
  Patch,
} from '@nestjs/common';

import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @CurrentMerchant() merchant: MerchantPayload,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(merchant.sub, dto);
  }
  @Get(':id')
  findOne(
    @CurrentMerchant() merchant: MerchantPayload,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.findOne(merchant.sub, orderId);
  }
  @Get()
  findAll(
    @CurrentMerchant() merchant: MerchantPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.ordersService.findAll(merchant.sub, query.page, query.limit);
  }
  @Patch(':id/cancel')
  cancel(
    @CurrentMerchant() merchant: MerchantPayload,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.cancel(merchant.sub, orderId);
  }
}
