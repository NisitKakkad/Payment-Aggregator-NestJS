
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

interface AccessTokenPayload {
  sub: string;
  email: string;
  type: string;
}

interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Access token required');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
          secret: this.configService.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
        });

      if (
        payload.type !== 'merchant' ||
        typeof payload.sub !== 'string' ||
        !payload.sub
      ) {
        throw new UnauthorizedException('Invalid access token');
      }

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
