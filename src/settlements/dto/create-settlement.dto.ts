import { IsOptional, Matches } from 'class-validator';

export class CreateSettlementDto {
  // Optional partial payout in paise. If omitted, the full available payable is settled.
  // The service validates this against the ledger-derived available balance.
  @IsOptional()
  @Matches(/^[1-9]\d*$/, {
    message: 'amount must be a positive integer string in paise',
  })
  amount?: string;
}
