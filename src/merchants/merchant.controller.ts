import { Controller, Post, Body, UseGuards, Get, Patch } from '@nestjs/common';

import { MerchantsService } from './merchant.service.js';
import { CreateMerchantDto } from './dto/create-merchant.dto.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UpdateWebhookDto } from './dto/update-webhook.dto.js';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post('register')
  register(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.register(dto);
  }
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentMerchant() merchant: MerchantPayload) {
    return this.merchantsService.getProfile(merchant.sub);
  }
  @UseGuards(JwtAuthGuard)
  @Patch('webhook')
  async updateWebhook(
    @CurrentMerchant() merchant: MerchantPayload,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.merchantsService.updateWebhookUrl(merchant.sub, dto.webhookUrl);
  }
}
