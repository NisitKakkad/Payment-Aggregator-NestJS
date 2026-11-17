import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export enum ProviderPaymentStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Injectable()
export class SimulatedProviderService {
  async processPayment() {
    // Simulate provider processing delay.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const success = Math.random() < 0.8;

    return {
      providerReference: `PAYFLOW_SIM_${randomUUID()}`,
      status: success
        ? ProviderPaymentStatus.SUCCESS
        : ProviderPaymentStatus.FAILED,
    };
  }
}