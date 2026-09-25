import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WeeklyScheduleSlotDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime!: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime!: string;
}

export class DateOverrideDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date!: string;

  @IsBoolean()
  isBlocked!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetAvailabilityDto {
  @IsOptional()
  @IsString()
  interviewerId?: string;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleSlotDto)
  weeklySchedule!: WeeklyScheduleSlotDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes?: number = 45;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  bufferMinutes?: number = 15;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
  minNoticeHours?: number = 24;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  maxInterviewsPerDay?: number = 6;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}

export interface AvailabilityProfileResponse {
  id: string;
  employerId: string;
  userId: string | null;
  timezone: string;
  weeklySchedule: WeeklyScheduleSlotDto[];
  dateOverrides: DateOverrideDto[];
  slotDurationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxInterviewsPerDay: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
