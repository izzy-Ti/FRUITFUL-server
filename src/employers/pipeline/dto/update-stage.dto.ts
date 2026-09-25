import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  @MaxLength(60)
  name?: string;

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
  stageType?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'color must be a valid hex color code (e.g. #3b82f6)',
  })
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}
