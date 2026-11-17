import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { Merchant } from './entities/merchant.entity.js';
import { CreateMerchantDto } from './dto/create-merchant.dto.js';
import { randomBytes } from 'crypto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
  ) {}

  async register(dto: CreateMerchantDto) {
    const existingMerchant = await this.merchantRepository.findOne({
      where: { email: dto.email },
    });

    if (existingMerchant) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const merchant = this.merchantRepository.create({
      businessName: dto.businessName,
      email: dto.email,
      passwordHash,
    });

    try {
      const savedMerchant = await this.merchantRepository.save(merchant);

      return {
        message: 'Merchant registered successfully',
        merchant: {
          id: savedMerchant.id,
          businessName: savedMerchant.businessName,
          email: savedMerchant.email,
          status: savedMerchant.status,
          createdAt: savedMerchant.createdAt,
        },
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw error;
    }
  }
  async getProfile(merchantId: string) {
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    return {
      id: merchant.id,
      businessName: merchant.businessName,
      email: merchant.email,
      status: merchant.status,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }
  async updateWebhookUrl(
  merchantId: string,
  webhookUrl: string,
) {
  const merchant = await this.merchantRepository.findOne({
    where: { id: merchantId },
  });

  if (!merchant) {
    throw new NotFoundException('Merchant not found');
  }

  merchant.webhookUrl = webhookUrl;

  const webhookSecret = randomBytes(32).toString('hex');
  merchant.webhookSecret = webhookSecret;

  await this.merchantRepository.save(merchant);

  return {
    message: 'Webhook URL updated successfully',
    webhookUrl: merchant.webhookUrl,
    webhookSecret,
  };
}
async getWebhookConfig(merchantId: string) {
  const merchant = await this.merchantRepository.findOne({
    where: { id: merchantId },
    select: {
      id: true,
      webhookUrl: true,
      webhookSecret: true,
    },
  });

  if (!merchant || !merchant.webhookUrl || !merchant.webhookSecret) {
    throw new NotFoundException(
      'Merchant webhook configuration not found',
    );
  }

  return {
    webhookUrl: merchant.webhookUrl,
    webhookSecret: merchant.webhookSecret,
  };
}
}
