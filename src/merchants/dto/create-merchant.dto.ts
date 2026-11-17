import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  businessName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;
}
