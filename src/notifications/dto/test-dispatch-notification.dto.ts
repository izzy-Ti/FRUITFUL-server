import { IsEnum, IsString, IsOptional, IsEmail } from 'class-validator';
import { NotificationType } from '../notifications.types.js';

export class TestDispatchNotificationDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  candidateName?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
