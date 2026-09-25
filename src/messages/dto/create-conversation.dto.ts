import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateConversationDto {
  /**
   * The ID of the JobSeekerProfile to chat with (if caller is Employer).
   */
  @IsString()
  @IsOptional()
  jobSeekerId?: string;

  /**
   * The ID of the EmployerProfile to chat with (if caller is Job Seeker).
   */
  @IsString()
  @IsOptional()
  employerId?: string;

  /**
   * Optional reference to a specific job posting this conversation relates to.
   */
  @IsString()
  @IsOptional()
  jobId?: string;

  /**
   * Optional first message to send immediately when creating the conversation.
   */
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  initialMessage?: string;
}
