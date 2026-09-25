import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';

export class ReviewReportDto {
  @IsNotEmpty()
  @IsIn(['resolved', 'dismissed'])
  status: 'resolved' | 'dismissed';

  @IsOptional()
  @IsIn(['none', 'message_hidden', 'user_warned', 'user_suspended'])
  actionTaken?: 'none' | 'message_hidden' | 'user_warned' | 'user_suspended';

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  adminNotes?: string;
}
