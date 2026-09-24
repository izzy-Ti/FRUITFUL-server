import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyEmployerDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsIn(['verified', 'rejected'], {
    message: 'Status must be either "verified" or "rejected"',
  })
  status!: 'verified' | 'rejected';

  @IsOptional()
  @IsString({ message: 'Rejection reason must be a string' })
  @MaxLength(500, { message: 'Rejection reason cannot exceed 500 characters' })
  rejectionReason?: string;
}
