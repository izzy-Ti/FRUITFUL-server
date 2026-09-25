import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStageDto {
  /**
   * Human-readable title of the hiring stage (e.g. "Take-home Assessment", "Panel Interview").
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  /**
   * Stage category type.
   */
  @IsString()
  @IsOptional()
  @IsIn([
    'source',
    'applied',
    'screening',
    'assessment',
    'interview',
    'offer',
    'hired',
    'rejected',
  ])
  stageType?: string = 'interview';

  /**
   * Color identifier for the Kanban column (Hex format, e.g. #3b82f6).
   */
  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'color must be a valid hex color code (e.g. #3b82f6)',
  })
  color?: string = '#3b82f6';

  /**
   * Optional description or instructions for interviewers in this stage.
   */
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  /**
   * If specified, stage is scoped specifically to this job posting. If omitted, applies as default company pipeline.
   */
  @IsString()
  @IsOptional()
  jobId?: string;

  /**
   * Optional display order index.
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}
