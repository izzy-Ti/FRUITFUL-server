import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateControlledDataDto {
  @IsOptional()
  @IsString({ message: 'Label must be a string' })
  @MaxLength(100, { message: 'Label cannot exceed 100 characters' })
  label?: string;

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
}
