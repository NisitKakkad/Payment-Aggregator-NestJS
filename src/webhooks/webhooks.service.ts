import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Webhook, WebhookStatus } from './entities/webhook.entity.js';
import { MerchantsService } from '../merchants/merchant.service.js';
import { WebhookSignatureService } from './webhook-signature.service.js';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    private readonly merchantsService: MerchantsService,
    private readonly webhookSignatureService: WebhookSignatureService,
  ) {}

  async createEvent(
    merchantId: string,
    paymentId: string,
    event: string,
    payload: Record<string, any>,
  ) {
    const webhook = this.webhookRepository.create({
      merchantId,
      paymentId,
      event,
      payload,
      status: WebhookStatus.PENDING,
    });

    return this.webhookRepository.save(webhook);
  }
  async deliverWebhook(webhookId: string) {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook event not found');
    }

    const config = await this.merchantsService.getWebhookConfig(
      webhook.merchantId,
    );

    const body = JSON.stringify(webhook.payload);

    const signature = this.webhookSignatureService.generateSignature(
      body,
      config.webhookSecret,
    );

    webhook.attempts += 1;
    await this.webhookRepository.save(webhook);

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PayFlow-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        webhook.status = WebhookStatus.FAILED;
        await this.webhookRepository.save(webhook);

        throw new Error(
          `Webhook delivery failed with status ${response.status}`,
        );
      }

      webhook.status = WebhookStatus.DELIVERED;

      await this.webhookRepository.save(webhook);

      return {
        delivered: true,
        statusCode: response.status,
        attempts: webhook.attempts,
      };
    } catch (error) {
      webhook.status = WebhookStatus.FAILED;
      await this.webhookRepository.save(webhook);
      throw error;
    }
  }
  async findAll(merchantId: string) {
    return this.webhookRepository.find({
      where: { merchantId },
      order: {
        createdAt: 'DESC',
      },
      select: {
        id: true,
        paymentId: true,
        event: true,
        status: true,
        attempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
  async retryWebhook(merchantId: string, webhookId: string) {
    const webhook = await this.webhookRepository.findOne({
      where: {
        id: webhookId,
        merchantId,
      },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook event not found');
    }

    if (webhook.status === WebhookStatus.DELIVERED) {
      throw new ConflictException('Webhook has already been delivered');
    }

    return this.deliverWebhook(webhook.id);
  }
}
