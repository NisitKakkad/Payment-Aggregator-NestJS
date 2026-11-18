import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { LedgerJournalStatus } from '../entities/ledger-journal.entity.js';

export class LedgerJournalFilterDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @IsOptional()
  @IsEnum(LedgerJournalStatus)
  status?: LedgerJournalStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
