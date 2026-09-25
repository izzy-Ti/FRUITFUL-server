import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateCandidateNoteDto {
  /**
   * The candidate job seeker profile ID this note is written for.
   */
  @IsString()
  @IsNotEmpty()
  profileId: string;

  /**
   * Optional application ID if note is tied to a specific job opening.
   */
  @IsString()
  @IsOptional()
  applicationId?: string;

  /**
   * Note content.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  /**
   * Structured note category.
   */
  @IsString()
  @IsOptional()
  @IsIn([
    'general',
    'phone_screen',
    'technical_interview',
    'behavioral',
    'salary_discussion',
    'reference_check',
    'rejection_reason',
  ])
  category?: string = 'general';

  /**
   * Optional evaluation rating from 1 to 5.
   */
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  /**
   * Pin this note to the top of the candidate dossier.
   */
  @IsBoolean()
  @IsOptional()
  isPinned?: boolean = false;
}

export class UpdateCandidateNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  content?: string;

  @IsString()
  @IsOptional()
  @IsIn([
    'general',
    'phone_screen',
    'technical_interview',
    'behavioral',
    'salary_discussion',
    'reference_check',
    'rejection_reason',
  ])
  category?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}

export class QueryCandidateNotesDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  applicationId?: string;
}
