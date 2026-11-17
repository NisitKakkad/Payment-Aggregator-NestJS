import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { WebhooksService } from './webhooks.service.js';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator.js';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentMerchant() merchant: MerchantPayload) {
    return this.webhooksService.findAll(merchant.sub);
  }
  @UseGuards(JwtAuthGuard)
@Post(':id/retry')
retryWebhook(
  @CurrentMerchant() merchant: MerchantPayload,
  @Param('id') webhookId: string,
) {
  return this.webhooksService.retryWebhook(
    merchant.sub,
    webhookId,
  );
}
}