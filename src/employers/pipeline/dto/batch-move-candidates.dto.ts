import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export class BatchMoveCandidatesDto {
  /**
   * Array of application IDs to move together.
   */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  applicationIds: string[];

  /**
   * Target pipeline stage ID.
   */
  @IsString()
  @IsNotEmpty()
  targetStageId: string;

  /**
   * Optional notes to record on each candidate's transition history.
   */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  /**
   * Whether to send notifications to moved candidates.
   */
  @IsBoolean()
  @IsOptional()
  notifyCandidates?: boolean = false;
}
