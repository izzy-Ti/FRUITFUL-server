import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum ApplicationStatus {
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
  SHORTLISTED = 'shortlisted',
  REJECTED = 'rejected',
  HIRED = 'hired',
  WITHDRAWN = 'withdrawn',
}

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  employerNotes?: string;
}
