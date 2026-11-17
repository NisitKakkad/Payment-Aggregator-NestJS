
import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

import type { Request } from 'express';

interface MerchantPayload {
  sub: string;
  email: string;
  type: string;
}

interface AuthenticatedRequest extends Request {
  user: MerchantPayload;
}

export const CurrentMerchant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MerchantPayload => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
