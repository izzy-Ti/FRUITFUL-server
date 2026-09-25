import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsISO8601,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum OfferStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  EXPIRED = 'expired',
}

export enum SalaryPeriod {
  YEARLY = 'yearly',
  MONTHLY = 'monthly',
  HOURLY = 'hourly',
}

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  applicationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary!: number;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';

  @IsOptional()
  @IsEnum(SalaryPeriod)
  salaryPeriod?: SalaryPeriod = SalaryPeriod.YEARLY;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsString()
  offerLetterUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendImmediately?: boolean = true;
}

export class UpdateOfferDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(SalaryPeriod)
  salaryPeriod?: SalaryPeriod;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsString()
  offerLetterUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RespondOfferDto {
  @IsEnum(['accept', 'decline'])
  action!: 'accept' | 'decline';

  @IsOptional()
  @IsString()
  feedback?: string;
}

export class WithdrawOfferDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueryOffersDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  candidateId?: string;
}
