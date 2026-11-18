import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export enum ProviderRefundStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Injectable()
export class SimulatedRefundProviderService {
  async processRefund() {
    // Simulate provider processing time.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate an 80% success rate.
    const success = Math.random() < 0.8;

    return {
      providerRefundReference: `PAYFLOW_REFUND_SIM_${randomUUID()}`,
      status: success
        ? ProviderRefundStatus.SUCCESS
        : ProviderRefundStatus.FAILED,
    };
  }
}
