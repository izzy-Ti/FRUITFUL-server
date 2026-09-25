import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class SaveCandidateDto {
  /** The job seeker profile ID to bookmark. */
  @IsString()
  profileId: string;

  /** Optional private note visible only to the employer. */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  /** Arbitrary tags for internal organisation (e.g. 'shortlist', 'follow-up'). */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
