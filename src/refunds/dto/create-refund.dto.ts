import { IsInt, IsPositive, Max, IsUUID } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  paymentId: string;

  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  amount: number;
}
