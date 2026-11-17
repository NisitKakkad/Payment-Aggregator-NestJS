import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';

@Injectable()
export class WebhookSignatureService {
  generateSignature(
    payload: string,
    secret: string,
  ): string {
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return `sha256=${signature}`;
  }
}