import { CalendarProvider } from '../dto/calendar-integration.dto';

export interface CalendarEventSyncPayload {
  eventId: string;
  interviewId?: string | null;
  title: string;
  description?: string | null;
  startTime: string; // ISO
  endTime: string;   // ISO
  timezone: string;
  location?: string | null;
  meetingUrl?: string | null;
  attendees: Array<{
    email: string;
    name?: string;
    role?: string;
  }>;
  sequence?: number;
  status?: string;
  iCalUid?: string | null;
}

export interface CalendarEventSyncResult {
  success: boolean;
  provider: CalendarProvider;
  externalEventId?: string;
  externalHtmlLink?: string;
  error?: string;
}

export interface ProviderTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  accountEmail?: string | null;
}

export interface ICalendarProvider {
  readonly provider: CalendarProvider;

  getAuthUrl(redirectUri: string, state: string): string;

  exchangeCodeForTokens(
    code: string,
    redirectUri?: string,
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    accountEmail?: string;
  }>;

  createEvent(
    tokens: ProviderTokens,
    payload: CalendarEventSyncPayload,
  ): Promise<CalendarEventSyncResult>;

  updateEvent(
    tokens: ProviderTokens,
    externalEventId: string,
    payload: CalendarEventSyncPayload,
  ): Promise<CalendarEventSyncResult>;

  deleteEvent(
    tokens: ProviderTokens,
    externalEventId: string,
  ): Promise<boolean>;
}
