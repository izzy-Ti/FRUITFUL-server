import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export const PROFILE_VISIBILITY = ['public', 'employers_only', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY)[number];

export class UpsertProfileDto {
  @IsOptional()
  @IsString({ message: 'Headline must be a string' })
  @MaxLength(120, { message: 'Headline cannot exceed 120 characters' })
  headline?: string;

  @IsOptional()
  @IsString({ message: 'Photo URL must be a string' })
  @IsUrl({}, { message: 'Photo URL must be a valid URL' })
  photoUrl?: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @MaxLength(2000, { message: 'Bio cannot exceed 2000 characters' })
  bio?: string;

  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  @MaxLength(120, { message: 'Location cannot exceed 120 characters' })
  location?: string;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  @MaxLength(30, { message: 'Phone number cannot exceed 30 characters' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'CV URL must be a string' })
  @IsUrl({}, { message: 'CV URL must be a valid URL' })
  cvUrl?: string;

  @IsOptional()
  @IsArray({ message: 'Languages must be an array of strings' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languages?: string[];

  @IsOptional()
  @IsString()
  @IsIn(PROFILE_VISIBILITY, {
    message: `visibility must be one of: ${PROFILE_VISIBILITY.join(', ')}`,
  })
  visibility?: string;

  @IsOptional()
  @IsBoolean({ message: 'isAvailable must be a boolean' })
  isAvailable?: boolean;
}
