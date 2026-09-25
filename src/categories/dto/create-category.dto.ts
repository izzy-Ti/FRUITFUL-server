import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'Category name is required' })
  @IsString({ message: 'Category name must be a string' })
  @MinLength(2, { message: 'Category name must be at least 2 characters long' })
  @MaxLength(80, { message: 'Category name cannot exceed 80 characters' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Slug must be a string' })
  @MaxLength(100, { message: 'Slug cannot exceed 100 characters' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description cannot exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Icon must be a string' })
  @MaxLength(100, { message: 'Icon cannot exceed 100 characters' })
  icon?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsInt({ message: 'displayOrder must be an integer' })
  displayOrder?: number;
}
