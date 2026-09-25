import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  isValidTimezone,
  normalizeTimezone,
  getLocalizedTimeDetails,
} from './timezone.util.js';
import {
  CalendarEventStatus,
  type CreateCalendarEventDto,
  type UpdateCalendarEventDto,
  type QueryCalendarEventsDto,
  type CalendarEventResponse,
} from './dto/calendar-event.dto.js';
import { CalendarIntegrationsService } from './calendar-sync/calendar-integrations.service.js';

@Injectable()
export class CalendarEventsService {
  private readonly logger = new Logger(CalendarEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly integrationsService?: CalendarIntegrationsService,
  ) {}

  /**
   * Create an ad-hoc calendar event or meeting.
   */
  async createEvent(
    user: AuthUser,
    dto: CreateCalendarEventDto,
  ): Promise<CalendarEventResponse> {
    const employer = await this.getEmployerProfile(user);

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('startTime and endTime must be valid ISO8601 timestamps.');
    }
    if (start >= end) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    const timezone = normalizeTimezone(dto.timezone || 'UTC');
    if (!isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: "${dto.timezone}".`);
    }

    const eventId = randomUUID();
    let meetingUrl = dto.meetingUrl || null;

    if (!meetingUrl && dto.createDailyCoRoom) {
      meetingUrl = await this.createDailyCoRoom(eventId, end);
    }

    const iCalUid = `event-${eventId}@fruitfuljourney.com`;
    const attendees = dto.attendees || [];
    const organizerEmail = dto.organizerEmail || employer.contactEmail || user.email;

    const created = await this.prisma.client.orm.public.CalendarEvent.create({
      id: eventId,
      employerId: employer.id,
      interviewId: dto.interviewId || null,
      title: dto.title.trim(),
      description: dto.description || null,
      eventType: dto.eventType || 'interview',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone,
      location: dto.location || null,
      meetingUrl,
      status: CalendarEventStatus.CONFIRMED,
      attendees,
      organizerEmail,
      sequence: 0,
      googleCalendarEventId: null,
      microsoftCalendarEventId: null,
      iCalUid,
      metadata: null,
    });

    if (this.integrationsService) {
      try {
        await this.integrationsService.syncEventToExternal(employer.id, created, 'create');
      } catch (err) {
        this.logger.warn(`Failed external calendar sync for event #${eventId}: ${err}`);
      }
    }

    this.logger.log(`Created calendar event #${eventId}: "${dto.title}" for employer #${employer.id}`);
    return this.enrichCalendarEvent(created);
  }

  /**
   * Automatically synchronize a JobInterview record into a persistent CalendarEvent.
   */
  async syncInterviewCalendarEvent(
    interview: any,
    employer: any,
    candidateUser: any,
    job: any,
    interviewerEmails: string[] = [],
  ): Promise<CalendarEventResponse> {
    const attendees: string[] = [];
    if (candidateUser?.email) attendees.push(candidateUser.email);
    for (const em of interviewerEmails) {
      if (em && !attendees.includes(em)) attendees.push(em);
    }

    const organizerEmail = employer.contactEmail || 'interviews@fruitfuljourney.com';
    const summary = `${interview.title}: ${candidateUser?.name || 'Candidate'} - ${job?.title || 'Job'}`;
    const description = `Fruitful Journey ATS Interview\nFormat: ${interview.interviewType.toUpperCase()}\nMeeting Link: ${interview.meetingLink || 'N/A'}\nInstructions: ${interview.candidateInstructions || 'N/A'}`;
    const iCalUid = `interview-${interview.id}@fruitfuljourney.com`;

    let existing = null;
    try {
      existing = await this.prisma.client.orm.public.CalendarEvent
        .where({ interviewId: interview.id })
        .first();
    } catch {
      //
    }

    let status = CalendarEventStatus.CONFIRMED;
    if (interview.status === 'cancelled') status = CalendarEventStatus.CANCELLED;

    if (existing) {
      const nextSequence = (existing.sequence || 0) + 1;
      const updated = await this.prisma.client.orm.public.CalendarEvent
        .where({ id: existing.id })
        .update({
          title: summary,
          description,
          startTime: interview.startTime,
          endTime: interview.endTime,
          timezone: interview.timezone,
          location: interview.location || null,
          meetingUrl: interview.meetingLink || null,
          status,
          attendees,
          sequence: nextSequence,
        });

      if (this.integrationsService) {
        try {
          await this.integrationsService.syncEventToExternal(
            employer.id,
            updated,
            status === CalendarEventStatus.CANCELLED ? 'delete' : 'update',
          );
        } catch {
          //
        }
      }

      return this.enrichCalendarEvent(updated);
    }

    const created = await this.prisma.client.orm.public.CalendarEvent.create({
      id: randomUUID(),
      employerId: employer.id,
      interviewId: interview.id,
      title: summary,
      description,
      eventType: 'interview',
      startTime: interview.startTime,
      endTime: interview.endTime,
      timezone: interview.timezone,
      location: interview.location || null,
      meetingUrl: interview.meetingLink || null,
      status,
      attendees,
      organizerEmail,
      sequence: 0,
      googleCalendarEventId: null,
      microsoftCalendarEventId: null,
      iCalUid,
      metadata: null,
    });

    if (this.integrationsService) {
      try {
        await this.integrationsService.syncEventToExternal(employer.id, created, 'create');
      } catch {
        //
      }
    }

    return this.enrichCalendarEvent(created);
  }

  /**
   * List calendar events across date ranges.
   */
  async getEvents(
    user: AuthUser,
    query: QueryCalendarEventsDto,
  ): Promise<CalendarEventResponse[]> {
    const employer = await this.getEmployerProfile(user);

    let events: any[] = [];
    try {
      const q = this.prisma.client.orm.public.CalendarEvent.where({
        employerId: employer.id,
      });
      events = (await q.all?.()) || [];
    } catch {
      events = [];
    }

    // Filter by query parameters
    let filtered = events;
    if (query.status) {
      filtered = filtered.filter((e) => e.status.toLowerCase() === query.status!.toLowerCase());
    }
    if (query.eventType) {
      filtered = filtered.filter((e) => e.eventType.toLowerCase() === query.eventType!.toLowerCase());
    }
    if (query.interviewId) {
      filtered = filtered.filter((e) => e.interviewId === query.interviewId);
    }
    if (query.from) {
      const fromTime = new Date(query.from).getTime();
      filtered = filtered.filter((e) => new Date(e.startTime).getTime() >= fromTime);
    }
    if (query.to) {
      const toTime = new Date(query.to).getTime();
      filtered = filtered.filter((e) => new Date(e.endTime).getTime() <= toTime);
    }

    filtered.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return filtered.map((e) => this.enrichCalendarEvent(e));
  }

  /**
   * Retrieve single event by ID.
   */
  async getEventById(user: AuthUser, eventId: string): Promise<CalendarEventResponse> {
    const employer = await this.getEmployerProfile(user);

    const event = await this.prisma.client.orm.public.CalendarEvent
      .where({ id: eventId })
      .first();

    if (!event) {
      throw new NotFoundException(`Calendar event #${eventId} not found.`);
    }

    if (event.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have access to this calendar event.');
    }

    return this.enrichCalendarEvent(event);
  }

  /**
   * Update calendar event.
   */
  async updateEvent(
    user: AuthUser,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ): Promise<CalendarEventResponse> {
    const employer = await this.getEmployerProfile(user);

    const event = await this.prisma.client.orm.public.CalendarEvent
      .where({ id: eventId })
      .first();

    if (!event) {
      throw new NotFoundException(`Calendar event #${eventId} not found.`);
    }

    if (event.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to update this calendar event.');
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.eventType !== undefined) updateData.eventType = dto.eventType;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.meetingUrl !== undefined) updateData.meetingUrl = dto.meetingUrl;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.attendees !== undefined) updateData.attendees = dto.attendees;

    if (dto.timezone !== undefined) {
      const tz = normalizeTimezone(dto.timezone);
      if (!isValidTimezone(tz)) {
        throw new BadRequestException(`Invalid IANA timezone: "${dto.timezone}".`);
      }
      updateData.timezone = tz;
    }

    if (dto.startTime || dto.endTime) {
      const s = new Date(dto.startTime || event.startTime);
      const e = new Date(dto.endTime || event.endTime);
      if (s >= e) {
        throw new BadRequestException('startTime must be strictly before endTime.');
      }
      if (dto.startTime) updateData.startTime = s.toISOString();
      if (dto.endTime) updateData.endTime = e.toISOString();
    }

    updateData.sequence = (event.sequence || 0) + 1;

    const updated = await this.prisma.client.orm.public.CalendarEvent
      .where({ id: eventId })
      .update(updateData);

    if (this.integrationsService) {
      try {
        await this.integrationsService.syncEventToExternal(
          employer.id,
          updated,
          updateData.status === CalendarEventStatus.CANCELLED ? 'delete' : 'update',
        );
      } catch {
        //
      }
    }

    return this.enrichCalendarEvent(updated);
  }

  /**
   * Cancel a calendar event.
   */
  async cancelEvent(user: AuthUser, eventId: string): Promise<CalendarEventResponse> {
    return this.updateEvent(user, eventId, { status: CalendarEventStatus.CANCELLED });
  }

  /**
   * Produce standard RFC 5545 iCalendar content for an event.
   */
  generateIcsForEvent(event: any, method: 'REQUEST' | 'CANCEL' = 'REQUEST'): string {
    const formatDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const dtStamp = formatDate(new Date().toISOString());
    const dtStart = formatDate(event.startTime);
    const dtEnd = formatDate(event.endTime);
    const uid = event.iCalUid || `event-${event.id}@fruitfuljourney.com`;
    const status = method === 'CANCEL' ? 'CANCELLED' : event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED';
    const seqNum = method === 'CANCEL' ? Math.max(1, (event.sequence || 0) + 1) : (event.sequence ?? 0);
    const sequence = String(seqNum);

    const escapeText = (str?: string | null) => {
      if (!str) return '';
      return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    };

    let attendeeLines = '';
    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    for (const email of attendees) {
      attendeeLines += `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}\r\n`;
    }

    const organizerEmail = event.organizerEmail || 'no-reply@fruitfuljourney.com';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Fruitful Journey//ATS Calendar Events//EN',
      'CALSCALE:GREGORIAN',
      `METHOD:${method}`,
      `X-WR-TIMEZONE:${event.timezone || 'UTC'}`,
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description || '')}`,
      event.location || event.meetingUrl ? `LOCATION:${escapeText(event.meetingUrl || event.location)}` : '',
      `STATUS:${status}`,
      `SEQUENCE:${sequence}`,
      `ORGANIZER;CN=Fruitful Journey:mailto:${organizerEmail}`,
      attendeeLines.trimEnd(),
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder: Event in 15 minutes',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter((line) => line !== '')
      .join('\r\n');
  }

  /**
   * Build 1-click Google Calendar web creation URL.
   */
  getGoogleCalendarUrl(event: any): string {
    const formatGDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const dates = `${formatGDate(event.startTime)}/${formatGDate(event.endTime)}`;
    const location = event.meetingUrl || event.location || 'Online Meeting';

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates,
      details: event.description || '',
      location,
      ctz: event.timezone || 'UTC',
    });

    const attendees = Array.isArray(event.attendees) ? event.attendees : [];
    for (const email of attendees) {
      params.append('add', email);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  private enrichCalendarEvent(event: any): CalendarEventResponse {
    const attendees = Array.isArray(event.attendees) ? [...event.attendees] : [];
    return {
      id: event.id,
      employerId: event.employerId,
      interviewId: event.interviewId || null,
      title: event.title,
      description: event.description || null,
      eventType: event.eventType || 'interview',
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone || 'UTC',
      location: event.location || null,
      meetingUrl: event.meetingUrl || null,
      status: event.status || CalendarEventStatus.CONFIRMED,
      attendees,
      organizerEmail: event.organizerEmail || null,
      googleCalendarEventId: event.googleCalendarEventId || null,
      iCalUid: event.iCalUid || null,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      googleCalendarUrl: this.getGoogleCalendarUrl(event),
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  private async createDailyCoRoom(eventId: string, endTime: Date): Promise<string | null> {
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) return null;

    try {
      const expTimestamp = Math.floor(endTime.getTime() / 1000) + 7200;
      const roomName = `fruitful-event-${eventId.slice(0, 8)}-${Date.now().toString(36)}`;

      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'public',
          properties: {
            exp: expTimestamp,
            enable_chat: true,
            enable_screenshare: true,
          },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data.url) {
          this.logger.log(`Created Daily.co video room for calendar event: ${data.url}`);
          return data.url;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to create Daily.co room for event ${eventId}: ${err}`);
    }
    return null;
  }

  private async getEmployerProfile(user: AuthUser) {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!profile) {
      if (user.role === Role.ADMIN) {
        const firstEmployer = await this.prisma.client.orm.public.EmployerProfile.all();
        if (firstEmployer.length > 0) return firstEmployer[0];
      }
      throw new NotFoundException('Employer profile not found for this account.');
    }
    return profile;
  }
}
