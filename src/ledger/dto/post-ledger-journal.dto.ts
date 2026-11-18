
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { LedgerEntryType } from '../entities/ledger-entry.entity.js';

class JournalLineDto {
  @IsUUID()
  accountId: string;

  @IsEnum(LedgerEntryType)
  type: LedgerEntryType;

  @IsString()
  @Matches(/^[1-9]\d*$/, {
    message: 'Amount must be a positive integer value in paise',
  })
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class PostLedgerJournalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  referenceType: string;

  @IsUUID()
  referenceId: string;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  entries: JournalLineDto[];
}
