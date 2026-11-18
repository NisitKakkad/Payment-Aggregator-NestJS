import { IsEnum } from 'class-validator';
import { LedgerAccountStatus } from '../entities/ledger-account.entity.js';

export class UpdateLedgerAccountStatusDto {
  @IsEnum(LedgerAccountStatus)
  status: LedgerAccountStatus;
}
