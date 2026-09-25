import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateControlledDataDto {
  @IsNotEmpty({ message: 'Category is required' })
  @IsString({ message: 'Category must be a string' })
  @MaxLength(60, { message: 'Category cannot exceed 60 characters' })
  category!: string;

  @IsNotEmpty({ message: 'Key is required' })
  @IsString({ message: 'Key must be a string' })
  @MaxLength(60, { message: 'Key cannot exceed 60 characters' })
  key!: string;

  @IsNotEmpty({ message: 'Label is required' })
  @IsString({ message: 'Label must be a string' })
  @MaxLength(100, { message: 'Label cannot exceed 100 characters' })
  label!: string;

  @IsOptional()
  @IsString({ message: 'Value must be a string' })
  value?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(300, { message: 'Description cannot exceed 300 characters' })
  description?: string;

  @IsOptional()
  @IsInt({ message: 'displayOrder must be an integer' })
  displayOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isSystem must be a boolean' })
  isSystem?: boolean;
}
