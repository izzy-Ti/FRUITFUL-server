import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreatePortfolioProjectDto {
  @IsNotEmpty({ message: 'Project title is required' })
  @IsString({ message: 'Project title must be a string' })
  @MaxLength(150, { message: 'Project title cannot exceed 150 characters' })
  title!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(3000, { message: 'Description cannot exceed 3000 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Category must be a string' })
  @MaxLength(80, { message: 'Category cannot exceed 80 characters' })
  category?: string;

  @IsOptional()
  @IsString({ message: 'Project URL must be a string' })
  @IsUrl({}, { message: 'Project URL must be a valid URL' })
  projectUrl?: string;

  @IsOptional()
  @IsString({ message: 'Repository URL must be a string' })
  @IsUrl({}, { message: 'Repository URL must be a valid URL' })
  repoUrl?: string;

  @IsOptional()
  @IsArray({ message: 'Images must be an array of strings' })
  @IsString({ each: true, message: 'Each image must be a URL string' })
  images?: string[];

  @IsOptional()
  @IsArray({ message: 'Documents must be an array of strings' })
  @IsString({ each: true, message: 'Each document must be a URL string' })
  documents?: string[];

  @IsOptional()
  @IsArray({ message: 'Links must be an array of strings' })
  @IsString({ each: true, message: 'Each link must be a URL string' })
  links?: string[];
}
