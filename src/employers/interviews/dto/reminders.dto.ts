import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ReminderType {
  HOURS_24 = '24h',
  HOUR_1 = '1h',
  MINUTES_15 = '15m',
  CUSTOM = 'custom',
}

export enum ReminderRecipient {
  CANDIDATE = 'candidate',
  INTERVIEWERS = 'interviewers',
  ALL = 'all',
}

export class ProcessRemindersDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  lookaheadMinutes?: number = 1440;
}

export class SendManualReminderDto {
  @IsOptional()
  @IsEnum(ReminderType)
  reminderType?: ReminderType = ReminderType.CUSTOM;

  @IsOptional()
  @IsString()
  customMessage?: string;

  @IsOptional()
  @IsEnum(ReminderRecipient)
  recipient?: ReminderRecipient = ReminderRecipient.ALL;
}

export interface DueReminderInterview {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
  candidateName: string;
  candidateEmail: string;
  employerName: string;
  jobTitle: string;
  meetingLink?: string | null;
  dueTypes: ('24h' | '1h' | '15m')[];
  minutesUntilStart: number;
}
