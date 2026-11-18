import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface SimulatedPayoutInput {
  settlementId: string;
  amount: string;
  currency: string;
}

export interface SimulatedPayoutResult {
  success: boolean;
  providerReference: string | null;
  failureReason: string | null;
}

@Injectable()
export class SimulatedPayoutProviderService {
  async processPayout(
    input: SimulatedPayoutInput,
  ): Promise<SimulatedPayoutResult> {
    // This is deliberately deterministic for a predictable development/demo workflow.
    // No bank, UPI, or real payment network is contacted.
    return {
      success: true,
      providerReference: `PAYFLOW_SIM_PAYOUT_${randomUUID()}`,
      failureReason: null,
    };
  }
}
