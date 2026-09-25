import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsISO8601,
  IsArray,
  IsBoolean,
  IsEnum,
} from 'class-validator';

export enum CalendarEventStatus {
  CONFIRMED = 'confirmed',
  TENTATIVE = 'tentative',
  CANCELLED = 'cancelled',
}

export class CreateCalendarEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  eventType?: string = 'interview';

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
  location?: string;

  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];

  @IsOptional()
  @IsString()
  organizerEmail?: string;

  @IsOptional()
  @IsString()
  interviewId?: string;

  @IsOptional()
  @IsBoolean()
  createDailyCoRoom?: boolean = false;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

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
  location?: string;

  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];

  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;
}

export class QueryCalendarEventsDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  interviewId?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export interface CalendarEventResponse {
  id: string;
  employerId: string;
  interviewId: string | null;
  title: string;
  description: string | null;
  eventType: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string | null;
  meetingUrl: string | null;
  status: string;
  attendees: string[];
  organizerEmail: string | null;
  googleCalendarEventId: string | null;
  iCalUid: string | null;
  metadata: any | null;
  googleCalendarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
