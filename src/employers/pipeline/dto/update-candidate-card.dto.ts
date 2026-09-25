import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCandidateCardDto {
  /**
   * Rating from 1 to 5 stars.
   */
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  /**
   * Tags assigned to this candidate in the pipeline (e.g. ['top_pick', 'onsite_ok']).
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  /**
   * Internal employer notes regarding this candidate.
   */
  @IsString()
  @IsOptional()
  @MaxLength(3000)
  employerNotes?: string;
}
