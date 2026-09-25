import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalendarEventsService } from './calendar-events.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';
import { CalendarEventStatus } from './dto/calendar-event.dto.js';

describe('CalendarEventsService', () => {
  let service: CalendarEventsService;
  let mockPrisma: any;

  const mockUser: any = {
    id: 'user-emp-1',
    role: Role.EMPLOYER,
    email: 'employer@fruitful.com',
  };

  const mockEmployerProfile = {
    id: 'emp-profile-1',
    userId: 'user-emp-1',
    name: 'Fruitful Technologies',
    contactEmail: 'talent@fruitful.com',
  };

  beforeEach(() => {
    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockEmployerProfile),
              }),
            },
            CalendarEvent: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
                all: vi.fn().mockResolvedValue([]),
                update: vi.fn().mockImplementation((val) =>
                  Promise.resolve({
                    id: 'event-1',
                    employerId: 'emp-profile-1',
                    title: 'Updated Event',
                    startTime: '2026-10-10T10:00:00.000Z',
                    endTime: '2026-10-10T11:00:00.000Z',
                    timezone: 'UTC',
                    status: CalendarEventStatus.CONFIRMED,
                    attendees: [],
                    ...val,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }),
                ),
              }),
              create: vi.fn().mockImplementation((val) =>
                Promise.resolve({
                  id: val.id,
                  ...val,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }),
              ),
            },
          },
        },
      },
    };

    service = new CalendarEventsService(mockPrisma);
  });

  describe('createEvent', () => {
    it('creates a calendar event and generates googleCalendarUrl', async () => {
      const result = await service.createEvent(mockUser, {
        title: 'Candidate Debrief Meeting',
        startTime: '2026-10-15T14:00:00.000Z',
        endTime: '2026-10-15T15:00:00.000Z',
        timezone: 'America/New_York',
        location: 'Conference Room B',
        attendees: ['interviewer1@fruitful.com', 'interviewer2@fruitful.com'],
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Candidate Debrief Meeting');
      expect(result.timezone).toBe('America/New_York');
      expect(result.status).toBe(CalendarEventStatus.CONFIRMED);
      expect(result.googleCalendarUrl).toContain('calendar.google.com');
      expect(result.googleCalendarUrl).toContain('ctz=America%2FNew_York');
      expect(result.attendees).toHaveLength(2);
      expect(mockPrisma.client.orm.public.CalendarEvent.create).toHaveBeenCalled();
    });

    it('throws BadRequestException if startTime >= endTime', async () => {
      await expect(
        service.createEvent(mockUser, {
          title: 'Invalid Event',
          startTime: '2026-10-15T15:00:00.000Z',
          endTime: '2026-10-15T14:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('syncInterviewCalendarEvent', () => {
    it('synchronizes a JobInterview into a persistent calendar event', async () => {
      const mockInterview = {
        id: 'interview-1',
        title: 'Technical Round 1',
        interviewType: 'video',
        startTime: '2026-10-16T10:00:00.000Z',
        endTime: '2026-10-16T11:00:00.000Z',
        timezone: 'UTC',
        meetingLink: 'https://fruitful.daily.co/interview-1',
        location: null,
        candidateInstructions: 'Review system design concepts',
        status: 'scheduled',
      };

      const mockCandidateUser = {
        name: 'John Developer',
        email: 'john@example.com',
      };

      const mockJob = {
        title: 'Senior Software Engineer',
      };

      const result = await service.syncInterviewCalendarEvent(
        mockInterview,
        mockEmployerProfile,
        mockCandidateUser,
        mockJob,
        ['lead@fruitful.com'],
      );

      expect(result).toBeDefined();
      expect(result.interviewId).toBe('interview-1');
      expect(result.title).toContain('Technical Round 1');
      expect(result.title).toContain('John Developer');
      expect(result.attendees).toContain('john@example.com');
      expect(result.attendees).toContain('lead@fruitful.com');
      expect(result.meetingUrl).toBe('https://fruitful.daily.co/interview-1');
      expect(result.status).toBe(CalendarEventStatus.CONFIRMED);
    });
  });

  describe('generateIcsForEvent', () => {
    it('generates standard RFC 5545 iCalendar content with alarms and attendees', () => {
      const mockEvent = {
        id: 'event-123',
        iCalUid: 'event-123@fruitfuljourney.com',
        title: 'Architecture Review',
        description: 'Deep dive into microservices',
        startTime: '2026-10-20T09:00:00.000Z',
        endTime: '2026-10-20T10:00:00.000Z',
        timezone: 'Africa/Addis_Ababa',
        location: 'Online Meeting',
        status: 'confirmed',
        attendees: ['lead@fruitful.com', 'candidate@example.com'],
        organizerEmail: 'talent@fruitful.com',
      };

      const ics = service.generateIcsForEvent(mockEvent, 'REQUEST');

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('UID:event-123@fruitfuljourney.com');
      expect(ics).toContain('SUMMARY:Architecture Review');
      expect(ics).toContain('X-WR-TIMEZONE:Africa/Addis_Ababa');
      expect(ics).toContain('ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:candidate@example.com');
      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('generates cancellation iCalendar content when method is CANCEL', () => {
      const mockEvent = {
        id: 'event-123',
        iCalUid: 'event-123@fruitfuljourney.com',
        title: 'Cancelled Meeting',
        startTime: '2026-10-20T09:00:00.000Z',
        endTime: '2026-10-20T10:00:00.000Z',
        status: 'cancelled',
        attendees: ['candidate@example.com'],
      };

      const ics = service.generateIcsForEvent(mockEvent, 'CANCEL');

      expect(ics).toContain('METHOD:CANCEL');
      expect(ics).toContain('STATUS:CANCELLED');
      expect(ics).toContain('SEQUENCE:1');
    });
  });

  describe('cancelEvent & getEventById', () => {
    it('cancels event and returns updated event with cancelled status', async () => {
      const mockExisting = {
        id: 'event-1',
        employerId: 'emp-profile-1',
        title: 'Meeting',
        startTime: '2026-10-20T09:00:00.000Z',
        endTime: '2026-10-20T10:00:00.000Z',
        timezone: 'UTC',
        status: CalendarEventStatus.CONFIRMED,
        attendees: [],
      };

      mockPrisma.client.orm.public.CalendarEvent.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockExisting),
        update: vi.fn().mockResolvedValue({
          ...mockExisting,
          status: CalendarEventStatus.CANCELLED,
        }),
      });

      const cancelled = await service.cancelEvent(mockUser, 'event-1');
      expect(cancelled.status).toBe(CalendarEventStatus.CANCELLED);
    });

    it('throws NotFoundException when event is missing', async () => {
      mockPrisma.client.orm.public.CalendarEvent.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.getEventById(mockUser, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
