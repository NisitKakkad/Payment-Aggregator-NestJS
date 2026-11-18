import {
  ArrayMinSize, IsArray, IsDateString, IsNotEmpty,
  IsString, Matches, MaxLength, ValidateNested, IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExternalPayoutRecordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  externalReference: string;

  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'amount must be a positive integer string in paise' })
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter uppercase code' })
  currency: string;

  @IsDateString()
  transactionDate: string;
}

export class ImportPayoutsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExternalPayoutRecordDto)
  records: ExternalPayoutRecordDto[];

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
