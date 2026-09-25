import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AlertFrequency } from './create-saved-search.dto.js';

export class UpdateSavedSearchDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsObject()
  @IsOptional()
  filters?: Record<string, unknown>;

  @IsEnum(AlertFrequency)
  @IsOptional()
  alertFrequency?: AlertFrequency;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean;
}
