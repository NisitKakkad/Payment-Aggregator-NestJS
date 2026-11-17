
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateOrderDto {
  @IsInt()
  @Min(1)
  @Max(9007199254740991)
  amount: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  receipt: string;
}
