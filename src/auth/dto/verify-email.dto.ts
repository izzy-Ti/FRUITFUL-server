import { IsEmail, IsOptional, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required when verifying with OTP' })
  email?: string;

  @IsOptional()
  @IsString()
  otp?: string;
}
