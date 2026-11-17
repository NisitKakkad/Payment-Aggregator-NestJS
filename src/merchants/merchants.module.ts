
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Merchant } from './entities/merchant.entity.js';
import { MerchantsController } from './merchant.controller.js';
import { MerchantsService } from './merchant.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Merchant]),
    AuthModule
  ],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}