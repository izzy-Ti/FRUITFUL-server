import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsArray,
  IsInt,
  Min,
  Max,
  IsBoolean,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InterviewType {
  VIDEO = 'video',
  PHONE = 'phone',
  IN_PERSON = 'in_person',
  TECHNICAL_ASSESSMENT = 'technical_assessment',
}

export enum InterviewStatus {
  SCHEDULED = 'scheduled',
  RESCHEDULED = 'rescheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export class ScheduleInterviewDto {
  @IsString()
  @IsNotEmpty()
  applicationId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsEnum(InterviewType)
  interviewType?: InterviewType = InterviewType.VIDEO;

  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @IsOptional()
  @IsString()
  candidateTimezone?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  candidateInstructions?: string;

  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean = false;
}

export class UpdateInterviewDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(InterviewType)
  interviewType?: InterviewType;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  candidateTimezone?: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  candidateInstructions?: string;

  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean = false;
}

export class CheckConflictDto {
  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @IsString()
  excludeInterviewId?: string;
}

export class AvailabilitySlotsDto {
  @IsString()
  @IsNotEmpty()
  startDate!: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  endDate!: string; // YYYY-MM-DD

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes?: number = 45;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'workingHoursStart must be in HH:MM format',
  })
  workingHoursStart?: string = '09:00';

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'workingHoursEnd must be in HH:MM format',
  })
  workingHoursEnd?: string = '17:00';

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @IsOptional()
  @IsString()
  candidateTimezone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  bufferMinutes?: number = 15;
}

export class ConvertTimezoneDto {
  @IsISO8601()
  @IsNotEmpty()
  timestamp!: string;

  @IsOptional()
  @IsString()
  fromTimezone?: string = 'UTC';

  @IsString()
  @IsNotEmpty()
  toTimezone!: string;
}

export class CalendarViewDto {
  @IsOptional()
  @IsString()
  month?: string; // YYYY-MM

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  interviewerId?: string;
}

export class CandidateRescheduleRequestDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsISO8601()
  @IsNotEmpty()
  proposedTime1!: string;

  @IsOptional()
  @IsISO8601()
  proposedTime2?: string;

  @IsOptional()
  @IsString()
  candidateTimezone?: string;
}

export class CancelInterviewDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class CompleteInterviewDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  feedbackSummary?: string;

  @IsOptional()
  @IsBoolean()
  createCandidateNote?: boolean = true;
}

export class QueryInterviewsDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  applicationId?: string;

  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  timeframe?: 'upcoming' | 'past' | 'all' = 'all';

  @IsOptional()
  @IsString()
  viewerTimezone?: string;
}

export class RescheduleInterviewDto {
  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  candidateTimezone?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interviewerIds?: string[];

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  candidateInstructions?: string;

  @IsOptional()
  @IsBoolean()
  allowOverlap?: boolean = false;

  @IsOptional()
  @IsBoolean()
  notifyCandidate?: boolean = true;

  @IsOptional()
  @IsBoolean()
  notifyInterviewers?: boolean = true;
}

export class CandidateDirectRescheduleDto {
  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsString()
  candidateTimezone?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CandidateCancelInterviewDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export * from './availability.dto';
export * from './calendar-event.dto';
export * from './reminders.dto';
export * from './calendar-integration.dto';
