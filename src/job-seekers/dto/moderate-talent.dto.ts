import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum TalentApprovalStatus {
  APPROVED = 'approved',
  PENDING = 'pending',
  REJECTED = 'rejected',
}

export class ModerateTalentDto {
  @IsEnum(TalentApprovalStatus)
  @IsNotEmpty()
  approvalStatus: TalentApprovalStatus;

  @IsString()
  @IsOptional()
  adminNotes?: string;
}
