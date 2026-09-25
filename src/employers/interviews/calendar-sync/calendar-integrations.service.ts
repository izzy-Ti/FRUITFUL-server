import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service.js';
import type { AuthUser } from '../../../auth/auth.service.js';
import { Role } from '../../../common/enums/role.enum.js';
import {
  CalendarProvider,
  CalendarIntegrationResponse,
  GenerateOAuthUrlDto,
  CalendarOAuthCallbackDto,
  ConnectCalendarIntegrationDto,
  UpdateCalendarIntegrationDto,
  CalendarSyncSummary,
  CalendarIntegrationStatus,
} from '../dto/calendar-integration.dto.js';
import { ICalendarProvider, CalendarEventSyncPayload } from './calendar-sync.interface.js';
import { GoogleCalendarProvider } from './providers/google-calendar.provider.js';
import { MicrosoftCalendarProvider } from './providers/microsoft-calendar.provider.js';

@Injectable()
export class CalendarIntegrationsService {
  private readonly logger = new Logger(CalendarIntegrationsService.name);
  private readonly providers: Map<CalendarProvider, ICalendarProvider> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleProvider: GoogleCalendarProvider,
    private readonly microsoftProvider: MicrosoftCalendarProvider,
  ) {
    this.providers.set(CalendarProvider.GOOGLE, this.googleProvider);
    this.providers.set(CalendarProvider.MICROSOFT, this.microsoftProvider);
  }

  private async getEmployerProfile(user: AuthUser) {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer) {
      throw new ForbiddenException('Employer profile not found.');
    }
    return employer;
  }

  /**
   * List all calendar integrations configured for the employer.
   */
  async listIntegrations(user: AuthUser): Promise<CalendarIntegrationResponse[]> {
    const employer = await this.getEmployerProfile(user);
    if (!employer) return [];

    let integrations: any[] = [];
    try {
      integrations = (await this.prisma.client.orm.public.CalendarIntegration
        .where({ employerId: employer.id })
        ?.all?.()) || [];
    } catch {
      integrations = [];
    }

    // Default integrations status if none exist
    const supported: CalendarProvider[] = [CalendarProvider.GOOGLE, CalendarProvider.MICROSOFT];
    const result: CalendarIntegrationResponse[] = [];

    for (const provider of supported) {
      const match = integrations.find((i) => i.provider === provider);
      if (match) {
        result.push(this.formatIntegrationResponse(match));
      } else {
        result.push({
          id: `unconnected-${provider}`,
          employerId: employer.id,
          provider: provider as any,
          accountEmail: null,
          calendarId: 'primary',
          calendarName: provider === CalendarProvider.GOOGLE ? 'Google Calendar' : 'Outlook Calendar',
          syncEnabled: false,
          syncDirection: 'bidirectional',
          lastSyncedAt: null,
          syncStatus: CalendarIntegrationStatus.DISCONNECTED,
          syncError: null,
          hasOAuthTokens: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return result;
  }

  /**
   * Generate OAuth authorization URL for connecting a calendar.
   */
  async getAuthUrl(
    user: AuthUser,
    dto: GenerateOAuthUrlDto,
  ): Promise<{ provider: string; authUrl: string; state: string }> {
    const employer = await this.getEmployerProfile(user);
    const providerImpl = this.providers.get(dto.provider);
    if (!providerImpl) {
      throw new BadRequestException(`Unsupported calendar provider: ${dto.provider}`);
    }

    const redirectUri =
      dto.redirectUri || `https://app.fruitfuljourney.com/api/integrations/${dto.provider}/callback`;
    const state = Buffer.from(
      JSON.stringify({
        employerId: employer.id,
        userId: user.id,
        provider: dto.provider,
        nonce: randomUUID(),
      }),
    ).toString('base64url');

    const authUrl = providerImpl.getAuthUrl(redirectUri, state);

    return {
      provider: dto.provider,
      authUrl,
      state,
    };
  }

  /**
   * Handle OAuth authorization code exchange.
   */
  async handleOAuthCallback(
    user: AuthUser,
    dto: CalendarOAuthCallbackDto,
  ): Promise<CalendarIntegrationResponse> {
    const employer = await this.getEmployerProfile(user);
    const providerImpl = this.providers.get(dto.provider);
    if (!providerImpl) {
      throw new BadRequestException(`Unsupported calendar provider: ${dto.provider}`);
    }

    const redirectUri =
      dto.redirectUri || `https://app.fruitfuljourney.com/api/integrations/${dto.provider}/callback`;
    const tokens = await providerImpl.exchangeCodeForTokens(dto.code, redirectUri);

    const existing = await this.prisma.client.orm.public.CalendarIntegration
      .where({
        employerId: employer.id,
        provider: dto.provider,
      })
      .first?.();

    let record: any;
    if (existing) {
      record = await this.prisma.client.orm.public.CalendarIntegration
        .where({ id: existing.id })
        .update({
          accountEmail: tokens.accountEmail || existing.accountEmail,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || existing.refreshToken,
          expiresAt: tokens.expiresAt || null,
          syncEnabled: true,
          syncStatus: CalendarIntegrationStatus.CONNECTED,
          syncError: null,
          lastSyncedAt: new Date().toISOString(),
        });
    } else {
      record = await this.prisma.client.orm.public.CalendarIntegration.create({
        id: randomUUID(),
        employerId: employer.id,
        userId: user.id,
        provider: dto.provider,
        accountEmail: tokens.accountEmail || null,
        calendarId: 'primary',
        calendarName: dto.provider === CalendarProvider.GOOGLE ? 'Google Calendar' : 'Outlook Calendar',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: tokens.expiresAt || null,
        syncEnabled: true,
        syncDirection: 'bidirectional',
        lastSyncedAt: new Date().toISOString(),
        syncStatus: CalendarIntegrationStatus.CONNECTED,
        syncError: null,
        webhookId: null,
        webhookSecret: null,
        webhookExpiresAt: null,
        metadata: null,
      });
    }

    this.logger.log(`Connected ${dto.provider} calendar for employer #${employer.id}`);
    return this.formatIntegrationResponse(record);
  }

  /**
   * Connect or manually configure calendar settings.
   */
  async connectManual(
    user: AuthUser,
    dto: ConnectCalendarIntegrationDto,
  ): Promise<CalendarIntegrationResponse> {
    const employer = await this.getEmployerProfile(user);

    const existing = await this.prisma.client.orm.public.CalendarIntegration
      .where({
        employerId: employer.id,
        provider: dto.provider,
      })
      .first?.();

    let record: any;
    if (existing) {
      record = await this.prisma.client.orm.public.CalendarIntegration
        .where({ id: existing.id })
        .update({
          accountEmail: dto.accountEmail ?? existing.accountEmail,
          calendarId: dto.calendarId ?? existing.calendarId,
          calendarName: dto.calendarName ?? existing.calendarName,
          accessToken: dto.accessToken ?? existing.accessToken,
          refreshToken: dto.refreshToken ?? existing.refreshToken,
          syncDirection: dto.syncDirection ?? existing.syncDirection,
          syncEnabled: dto.syncEnabled ?? existing.syncEnabled,
          syncStatus: CalendarIntegrationStatus.CONNECTED,
          syncError: null,
        });
    } else {
      record = await this.prisma.client.orm.public.CalendarIntegration.create({
        id: randomUUID(),
        employerId: employer.id,
        userId: user.id,
        provider: dto.provider,
        accountEmail: dto.accountEmail || null,
        calendarId: dto.calendarId || 'primary',
        calendarName: dto.calendarName || (dto.provider === CalendarProvider.GOOGLE ? 'Google Calendar' : 'Outlook Calendar'),
        accessToken: dto.accessToken || null,
        refreshToken: dto.refreshToken || null,
        expiresAt: null,
        syncEnabled: dto.syncEnabled ?? true,
        syncDirection: dto.syncDirection || 'bidirectional',
        lastSyncedAt: null,
        syncStatus: CalendarIntegrationStatus.CONNECTED,
        syncError: null,
        webhookId: null,
        webhookSecret: null,
        webhookExpiresAt: null,
        metadata: null,
      });
    }

    return this.formatIntegrationResponse(record);
  }

  /**
   * Update integration settings.
   */
  async updateIntegration(
    user: AuthUser,
    provider: CalendarProvider,
    dto: UpdateCalendarIntegrationDto,
  ): Promise<CalendarIntegrationResponse> {
    const employer = await this.getEmployerProfile(user);

    const existing = await this.prisma.client.orm.public.CalendarIntegration
      .where({
        employerId: employer.id,
        provider,
      })
      .first?.();

    if (!existing) {
      throw new NotFoundException(`Calendar integration for provider "${provider}" not found.`);
    }

    const updateData: any = {};
    if (dto.syncEnabled !== undefined) updateData.syncEnabled = dto.syncEnabled;
    if (dto.syncDirection !== undefined) updateData.syncDirection = dto.syncDirection;
    if (dto.calendarId !== undefined) updateData.calendarId = dto.calendarId;
    if (dto.calendarName !== undefined) updateData.calendarName = dto.calendarName;

    const updated = await this.prisma.client.orm.public.CalendarIntegration
      .where({ id: existing.id })
      .update(updateData);

    return this.formatIntegrationResponse(updated);
  }

  /**
   * Disconnect a calendar integration.
   */
  async disconnect(
    user: AuthUser,
    provider: CalendarProvider,
  ): Promise<{ success: boolean; message: string }> {
    const employer = await this.getEmployerProfile(user);

    const existing = await this.prisma.client.orm.public.CalendarIntegration
      .where({
        employerId: employer.id,
        provider,
      })
      .first?.();

    if (existing) {
      await this.prisma.client.orm.public.CalendarIntegration
        .where({ id: existing.id })
        .update({
          syncEnabled: false,
          syncStatus: CalendarIntegrationStatus.DISCONNECTED,
          accessToken: null,
          refreshToken: null,
        });
    }

    return {
      success: true,
      message: `${provider} calendar integration disconnected.`,
    };
  }

  /**
   * Sync a calendar event change to all connected external calendars.
   */
  async syncEventToExternal(
    employerId: string,
    event: any,
    action: 'create' | 'update' | 'delete',
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    let integrations: any[] = [];
    try {
      integrations = (await this.prisma.client.orm.public.CalendarIntegration
        .where({
          employerId,
          syncEnabled: true,
        })
        ?.all?.()) || [];
    } catch {
      return results;
    }

    if (integrations.length === 0) return results;

    const payload: CalendarEventSyncPayload = {
      eventId: event.id,
      interviewId: event.interviewId,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
      location: event.location,
      meetingUrl: event.meetingUrl,
      sequence: event.sequence ?? 0,
      status: event.status,
      iCalUid: event.iCalUid,
      attendees: (event.attendees || []).map((email: string) => ({
        email,
        name: email.split('@')[0],
      })),
    };

    for (const integration of integrations) {
      const providerKey = integration.provider as CalendarProvider;
      const providerImpl = this.providers.get(providerKey);
      if (!providerImpl) continue;

      const tokens = {
        accessToken: integration.accessToken,
        refreshToken: integration.refreshToken,
        expiresAt: integration.expiresAt,
        accountEmail: integration.accountEmail,
      };

      try {
        if (action === 'create') {
          const res = await providerImpl.createEvent(tokens, payload);
          results[providerKey] = res;

          if (res.success && res.externalEventId) {
            const updateField =
              providerKey === CalendarProvider.GOOGLE
                ? { googleCalendarEventId: res.externalEventId }
                : { microsoftCalendarEventId: res.externalEventId };

            await this.prisma.client.orm.public.CalendarEvent
              .where({ id: event.id })
              .update(updateField);
          }
        } else if (action === 'update') {
          const externalEventId =
            providerKey === CalendarProvider.GOOGLE
              ? event.googleCalendarEventId
              : event.microsoftCalendarEventId;

          if (externalEventId) {
            const res = await providerImpl.updateEvent(tokens, externalEventId, payload);
            results[providerKey] = res;
          } else {
            const res = await providerImpl.createEvent(tokens, payload);
            results[providerKey] = res;
          }
        } else if (action === 'delete') {
          const externalEventId =
            providerKey === CalendarProvider.GOOGLE
              ? event.googleCalendarEventId
              : event.microsoftCalendarEventId;

          if (externalEventId) {
            const deleted = await providerImpl.deleteEvent(tokens, externalEventId);
            results[providerKey] = { success: deleted, provider: providerKey };
          }
        }

        // Update last synced timestamp
        await this.prisma.client.orm.public.CalendarIntegration
          .where({ id: integration.id })
          .update({
            lastSyncedAt: new Date().toISOString(),
            syncStatus: CalendarIntegrationStatus.CONNECTED,
            syncError: null,
          });
      } catch (err: any) {
        this.logger.warn(`Failed external sync to ${providerKey}: ${err?.message || err}`);
        results[providerKey] = { success: false, error: err?.message };

        await this.prisma.client.orm.public.CalendarIntegration
          .where({ id: integration.id })
          .update({
            syncStatus: CalendarIntegrationStatus.ERROR,
            syncError: err?.message || 'Sync failed',
          });
      }
    }

    return results;
  }

  /**
   * Trigger manual full sync of upcoming events.
   */
  async triggerFullSync(user: AuthUser, provider?: CalendarProvider): Promise<CalendarSyncSummary> {
    const employer = await this.getEmployerProfile(user);
    const nowIso = new Date().toISOString();

    const events = (await this.prisma.client.orm.public.CalendarEvent
      .where({ employerId: employer.id })
      ?.all?.()) || [];

    const upcomingEvents = events.filter((e) => new Date(e.startTime).getTime() >= Date.now() - 3600000);

    let syncedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const event of upcomingEvents) {
      try {
        const syncResult = await this.syncEventToExternal(employer.id, event, 'update');
        const hasFailure = Object.values(syncResult).some((r: any) => !r.success);
        if (hasFailure) {
          failedCount++;
        } else {
          syncedCount++;
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`Event #${event.id}: ${err?.message}`);
      }
    }

    return {
      provider: provider || 'all',
      success: failedCount === 0,
      syncedEventsCount: syncedCount,
      failedEventsCount: failedCount,
      errors,
      lastSyncedAt: nowIso,
    };
  }

  private formatIntegrationResponse(raw: any): CalendarIntegrationResponse {
    return {
      id: raw.id,
      employerId: raw.employerId,
      provider: raw.provider,
      accountEmail: raw.accountEmail || null,
      calendarId: raw.calendarId || 'primary',
      calendarName: raw.calendarName || null,
      syncEnabled: Boolean(raw.syncEnabled),
      syncDirection: raw.syncDirection || 'bidirectional',
      lastSyncedAt: raw.lastSyncedAt || null,
      syncStatus: raw.syncStatus || CalendarIntegrationStatus.CONNECTED,
      syncError: raw.syncError || null,
      hasOAuthTokens: Boolean(raw.accessToken),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}
