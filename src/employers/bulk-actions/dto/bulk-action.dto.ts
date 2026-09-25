import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

export type BulkActionType =
  | 'status_update'
  | 'reject'
  | 'add_tags'
  | 'remove_tags'
  | 'set_rating'
  | 'add_note'
  | 'export';

export class BulkCandidateActionDto {
  /**
   * Type of bulk action to perform.
   */
  @IsNotEmpty()
  @IsIn([
    'status_update',
    'reject',
    'add_tags',
    'remove_tags',
    'set_rating',
    'add_note',
    'export',
  ])
  action: BulkActionType;

  /**
   * Array of application IDs to target.
   */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  applicationIds: string[];

  /**
   * Target application status for status_update action.
   */
  @IsString()
  @IsOptional()
  status?: string;

  /**
   * Target pipeline stage ID for status_update action.
   */
  @IsString()
  @IsOptional()
  stageId?: string;

  /**
   * Tags to add or remove in tag actions.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  /**
   * Rating from 1 to 5 for set_rating action.
   */
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  /**
   * Reason for rejection in reject action.
   */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  rejectionReason?: string;

  /**
   * Notes or feedback recorded during the action.
   */
  @IsString()
  @IsOptional()
  @MaxLength(3000)
  notes?: string;

  /**
   * Category for bulk note action.
   */
  @IsString()
  @IsOptional()
  noteCategory?: string;

  /**
   * Whether to send email/in-app status update notifications to candidates.
   */
  @IsBoolean()
  @IsOptional()
  notifyCandidates?: boolean = false;
}
