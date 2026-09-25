import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUrl,
} from 'class-validator';

export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
}

export enum CalendarSyncDirection {
  BIDIRECTIONAL = 'bidirectional',
  PUSH_ONLY = 'push_only',
  PULL_ONLY = 'pull_only',
}

export enum CalendarIntegrationStatus {
  CONNECTED = 'connected',
  SYNCING = 'syncing',
  ERROR = 'error',
  DISCONNECTED = 'disconnected',
}

export class GenerateOAuthUrlDto {
  @IsEnum(CalendarProvider)
  @IsNotEmpty()
  provider!: CalendarProvider;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}

export class CalendarOAuthCallbackDto {
  @IsEnum(CalendarProvider)
  @IsNotEmpty()
  provider!: CalendarProvider;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;

  @IsOptional()
  @IsString()
  state?: string;
}

export class ConnectCalendarIntegrationDto {
  @IsEnum(CalendarProvider)
  @IsNotEmpty()
  provider!: CalendarProvider;

  @IsOptional()
  @IsString()
  accountEmail?: string;

  @IsOptional()
  @IsString()
  calendarId?: string = 'primary';

  @IsOptional()
  @IsString()
  calendarName?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsEnum(CalendarSyncDirection)
  syncDirection?: CalendarSyncDirection = CalendarSyncDirection.BIDIRECTIONAL;

  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean = true;
}

export class UpdateCalendarIntegrationDto {
  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean;

  @IsOptional()
  @IsEnum(CalendarSyncDirection)
  syncDirection?: CalendarSyncDirection;

  @IsOptional()
  @IsString()
  calendarId?: string;

  @IsOptional()
  @IsString()
  calendarName?: string;
}

export interface CalendarIntegrationResponse {
  id: string;
  employerId: string;
  provider: 'google' | 'microsoft';
  accountEmail?: string | null;
  calendarId: string;
  calendarName?: string | null;
  syncEnabled: boolean;
  syncDirection: string;
  lastSyncedAt?: string | null;
  syncStatus: string;
  syncError?: string | null;
  hasOAuthTokens: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarSyncSummary {
  provider: string;
  success: boolean;
  syncedEventsCount: number;
  failedEventsCount: number;
  errors: string[];
  lastSyncedAt: string;
}
