import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class MoveCandidateDto {
  /**
   * Target pipeline stage ID to move candidate to.
   */
  @IsString()
  @IsNotEmpty()
  targetStageId: string;

  /**
   * Optional notes or feedback regarding this stage transition.
   */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  /**
   * Whether to send an email/notification to the candidate about their application update.
   */
  @IsBoolean()
  @IsOptional()
  notifyCandidate?: boolean = false;
}
