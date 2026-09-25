import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum SavedSearchType {
  JOB = 'job',
  TALENT = 'talent',
}

export enum AlertFrequency {
  IMMEDIATELY = 'immediately',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  NEVER = 'never',
}

export class CreateSavedSearchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsEnum(SavedSearchType)
  type: SavedSearchType;

  /**
   * JSON-serialisable filter object matching the target query DTO shape.
   * Stored as a JSON string in the database.
   */
  @IsObject()
  filters: Record<string, unknown>;

  @IsEnum(AlertFrequency)
  @IsOptional()
  alertFrequency?: AlertFrequency = AlertFrequency.DAILY;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean = true;
}
