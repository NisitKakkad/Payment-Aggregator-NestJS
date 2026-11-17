import { Injectable, UnauthorizedException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import * as bcrypt from 'bcrypt';

import { Merchant } from '../merchants/entities/merchant.entity.js';
import { MerchantRefreshToken } from './entities/merchant-refresh-token.entity.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,

    @InjectRepository(MerchantRefreshToken)
    private readonly refreshTokenRepository: Repository<MerchantRefreshToken>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private async generateTokens(merchant: Merchant) {
    const payload = {
      sub: merchant.id,
      email: merchant.email,
      type: 'merchant',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(merchantId: string, refreshToken: string) {
    const tokenHash = await bcrypt.hash(refreshToken, 12);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const record = this.refreshTokenRepository.create({
      merchantId,
      tokenHash,
      expiresAt,
    });

    await this.refreshTokenRepository.save(record);
  }

  async login(dto: LoginDto) {
    const merchant = await this.merchantRepository
      .createQueryBuilder('merchant')
      .addSelect('merchant.passwordHash')
      .where('LOWER(merchant.email) = LOWER(:email)', {
        email: dto.email.trim(),
      })
      .getOne();

    if (
      !merchant ||
      !(await bcrypt.compare(dto.password, merchant.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(merchant);

    await this.storeRefreshToken(merchant.id, tokens.refreshToken);

    return {
      message: 'Login successful',
      ...tokens,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        email: merchant.email,
        status: merchant.status,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    let payload: {
      sub: string;
      email: string;
      type: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'merchant') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(MerchantRefreshToken);
      const merchantRepository = manager.getRepository(Merchant);

      const records = await tokenRepository.find({
        where: {
          merchantId: payload.sub,
          revokedAt: IsNull(),
        },
      });

      let matchedToken: MerchantRefreshToken | undefined;

      for (const record of records) {
        if (
          record.expiresAt > new Date() &&
          (await bcrypt.compare(refreshToken, record.tokenHash))
        ) {
          matchedToken = record;
          break;
        }
      }

      if (!matchedToken) {
        throw new UnauthorizedException('Refresh token revoked or expired');
      }

      matchedToken.revokedAt = new Date();
      await tokenRepository.save(matchedToken);

      const merchant = await merchantRepository.findOne({
        where: { id: payload.sub },
      });

      if (!merchant) {
        throw new UnauthorizedException('Merchant not found');
      }

      const tokens = await this.generateTokens(merchant);

      const tokenHash = await bcrypt.hash(tokens.refreshToken, 12);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const newRecord = tokenRepository.create({
        merchantId: merchant.id,
        tokenHash,
        expiresAt,
      });

      await tokenRepository.save(newRecord);

      return tokens;
    });
  }

  async logout(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    const records = await this.refreshTokenRepository.find({
      where: { revokedAt: IsNull() },
    });

    for (const record of records) {
      if (await bcrypt.compare(refreshToken, record.tokenHash)) {
        record.revokedAt = new Date();
        await this.refreshTokenRepository.save(record);

        return { message: 'Logged out successfully' };
      }
    }

    throw new UnauthorizedException('Invalid refresh token');
  }
}
