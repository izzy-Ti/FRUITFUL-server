import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpsertEmployerProfileDto {
  @IsNotEmpty({ message: 'Organization name is required' })
  @IsString({ message: 'Organization name must be a string' })
  @MaxLength(150, { message: 'Organization name cannot exceed 150 characters' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Logo URL must be a string' })
  @IsUrl({}, { message: 'Logo URL must be a valid URL' })
  logoUrl?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(3000, { message: 'Description cannot exceed 3000 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Industry must be a string' })
  @MaxLength(100, { message: 'Industry cannot exceed 100 characters' })
  industry?: string;

  @IsOptional()
  @IsString({ message: 'Company size must be a string' })
  @MaxLength(50, { message: 'Company size cannot exceed 50 characters' })
  companySize?: string;

  @IsOptional()
  @IsString({ message: 'Website URL must be a string' })
  @IsUrl({}, { message: 'Website URL must be a valid URL' })
  websiteUrl?: string;

  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  @MaxLength(120, { message: 'Location cannot exceed 120 characters' })
  location?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Contact email must be a valid email address' })
  contactEmail?: string;

  @IsOptional()
  @IsString({ message: 'Contact phone must be a string' })
  @MaxLength(30, { message: 'Contact phone cannot exceed 30 characters' })
  contactPhone?: string;
}
