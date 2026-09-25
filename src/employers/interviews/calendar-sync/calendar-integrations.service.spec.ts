import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalendarIntegrationsService } from './calendar-integrations.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider';
import { CalendarProvider, CalendarIntegrationStatus } from '../dto/calendar-integration.dto';
import { Role } from '../../../common/enums/role.enum';
import type { AuthUser } from '../../../auth/auth.service';

describe('CalendarIntegrationsService', () => {
  let service: CalendarIntegrationsService;
  let mockPrisma: any;
  let googleProvider: GoogleCalendarProvider;
  let microsoftProvider: MicrosoftCalendarProvider;

  const mockUser: AuthUser = {
    id: 'user-emp-1',
    name: 'Fruitful Recruiter',
    email: 'employer@fruitful.com',
    role: Role.EMPLOYER,
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: 'user-emp-1',
    name: 'Fruitful Corp',
    contactEmail: 'contact@fruitful.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockEmployer),
              }),
            },
            CalendarIntegration: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
                first: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'ci-1', ...data })),
              }),
              create: vi.fn().mockImplementation((data) => Promise.resolve({ ...data })),
            },
            CalendarEvent: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
                first: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'evt-1', ...data })),
              }),
            },
          },
        },
      },
    };

    googleProvider = new GoogleCalendarProvider();
    microsoftProvider = new MicrosoftCalendarProvider();
    service = new CalendarIntegrationsService(mockPrisma, googleProvider, microsoftProvider);
  });

  describe('listIntegrations', () => {
    it('should return disconnected states for unconfigured providers', async () => {
      const result = await service.listIntegrations(mockUser);
      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe(CalendarProvider.GOOGLE);
      expect(result[0].syncStatus).toBe(CalendarIntegrationStatus.DISCONNECTED);
      expect(result[1].provider).toBe(CalendarProvider.MICROSOFT);
      expect(result[1].syncStatus).toBe(CalendarIntegrationStatus.DISCONNECTED);
    });

    it('should return configured integration details when existing in database', async () => {
      mockPrisma.client.orm.public.CalendarIntegration.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'ci-1',
            employerId: 'emp-profile-1',
            provider: 'google',
            accountEmail: 'recruiter@fruitful.com',
            calendarId: 'primary',
            calendarName: 'Google Calendar',
            accessToken: 'valid-token',
            syncEnabled: true,
            syncDirection: 'bidirectional',
            syncStatus: 'connected',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      });

      const result = await service.listIntegrations(mockUser);
      const google = result.find((i) => i.provider === CalendarProvider.GOOGLE);
      expect(google).toBeDefined();
      expect(google?.syncStatus).toBe(CalendarIntegrationStatus.CONNECTED);
      expect(google?.hasOAuthTokens).toBe(true);
      expect(google?.accountEmail).toBe('recruiter@fruitful.com');
    });
  });

  describe('getAuthUrl', () => {
    it('should generate Google OAuth URL with proper scopes and state', async () => {
      const res = await service.getAuthUrl(mockUser, { provider: CalendarProvider.GOOGLE });
      expect(res.provider).toBe(CalendarProvider.GOOGLE);
      expect(res.authUrl).toContain('accounts.google.com');
      expect(res.authUrl).toContain('calendar.events');
      expect(res.state).toBeDefined();
    });

    it('should generate Microsoft OAuth URL with Graph scopes', async () => {
      const res = await service.getAuthUrl(mockUser, { provider: CalendarProvider.MICROSOFT });
      expect(res.provider).toBe(CalendarProvider.MICROSOFT);
      expect(res.authUrl).toContain('login.microsoftonline.com');
      expect(res.authUrl).toContain('Calendars.ReadWrite');
    });
  });

  describe('handleOAuthCallback', () => {
    it('should exchange code for tokens and persist integration record', async () => {
      const res = await service.handleOAuthCallback(mockUser, {
        provider: CalendarProvider.GOOGLE,
        code: 'auth-code-123',
      });

      expect(res.provider).toBe(CalendarProvider.GOOGLE);
      expect(res.syncStatus).toBe(CalendarIntegrationStatus.CONNECTED);
      expect(res.hasOAuthTokens).toBe(true);
      expect(mockPrisma.client.orm.public.CalendarIntegration.create).toHaveBeenCalled();
    });
  });

  describe('connectManual', () => {
    it('should manually configure integration with custom settings', async () => {
      const res = await service.connectManual(mockUser, {
        provider: CalendarProvider.MICROSOFT,
        accountEmail: 'recruiter@outlook.com',
        calendarName: 'Work Calendar',
      });

      expect(res.provider).toBe(CalendarProvider.MICROSOFT);
      expect(res.accountEmail).toBe('recruiter@outlook.com');
      expect(res.calendarName).toBe('Work Calendar');
      expect(res.syncStatus).toBe(CalendarIntegrationStatus.CONNECTED);
    });
  });

  describe('disconnect', () => {
    it('should disconnect integration and clear tokens', async () => {
      mockPrisma.client.orm.public.CalendarIntegration.where.mockReturnValueOnce({
        first: vi.fn().mockResolvedValue({
          id: 'ci-1',
          employerId: 'emp-profile-1',
          provider: 'google',
        }),
      });

      const res = await service.disconnect(mockUser, CalendarProvider.GOOGLE);
      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.CalendarIntegration.where().update).toHaveBeenCalledWith(
        expect.objectContaining({
          syncEnabled: false,
          syncStatus: CalendarIntegrationStatus.DISCONNECTED,
          accessToken: null,
        }),
      );
    });
  });

  describe('syncEventToExternal', () => {
    it('should push event to active external calendar providers and return sync results', async () => {
      mockPrisma.client.orm.public.CalendarIntegration.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'ci-1',
            employerId: 'emp-profile-1',
            provider: 'google',
            syncEnabled: true,
            accessToken: 'token-123',
          },
        ]),
      });

      const mockEvent = {
        id: 'evt-1',
        interviewId: 'int-1',
        title: 'Technical Interview',
        startTime: new Date(Date.now() + 3600000).toISOString(),
        endTime: new Date(Date.now() + 7200000).toISOString(),
        timezone: 'UTC',
        status: 'confirmed',
        attendees: ['candidate@example.com'],
      };

      const result = await service.syncEventToExternal('emp-profile-1', mockEvent, 'create');
      expect(result.google).toBeDefined();
      expect(result.google.success).toBe(true);
      expect(result.google.externalEventId).toBeDefined();
    });
  });
});
