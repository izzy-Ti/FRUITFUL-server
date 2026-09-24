import { IsEmail } from 'class-validator';

export class SendVerificationEmailDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;
}
