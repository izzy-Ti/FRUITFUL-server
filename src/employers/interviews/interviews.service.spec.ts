import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InterviewsService } from './interviews.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let mockPrisma: any;
  let mockNotifications: any;
  let interviewUpdateMock: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'hr@acme.com',
    name: 'Acme Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const otherEmployerUser: AuthUser = {
    id: 'user-other-emp',
    email: 'other@company.com',
    name: 'Other HR',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const candidateUser: AuthUser = {
    id: 'user-cand-1',
    email: 'jane@example.com',
    name: 'Jane Doe',
    role: Role.JOB_SEEKER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corp',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-profile-1',
    title: 'Lead Architect',
    companyName: 'Acme Corp',
  };

  const mockCandidateProfile = {
    id: 'cand-profile-1',
    userId: candidateUser.id,
    headline: 'Senior Cloud Engineer',
    photoUrl: 'https://example.com/photo.jpg',
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'cand-profile-1',
    status: 'submitted',
  };

  const now = new Date();
  const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2 hours
  const endTime = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(); // +3 hours

  const mockInterview = {
    id: 'interview-1',
    applicationId: 'app-1',
    employerId: 'emp-profile-1',
    candidateId: 'cand-profile-1',
    jobId: 'job-1',
    title: 'System Design Interview',
    interviewType: 'video',
    status: 'scheduled',
    startTime,
    endTime,
    timezone: 'UTC',
    meetingLink: 'https://meet.google.com/xyz',
    location: null,
    interviewerIds: ['user-emp-1'],
    notes: 'Focus on distributed systems',
    candidateInstructions: 'Please prepare whiteboard setup',
    rating: null,
    feedbackSummary: null,
    cancellationReason: null,
    reminderSent24h: false,
    reminderSent1h: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    interviewUpdateMock = vi.fn().mockResolvedValue({ count: 1 });
    mockNotifications = {
      sendInterviewNotification: vi.fn().mockResolvedValue(true),
      sendInterviewCancellationNotification: vi.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => mockEmployer),
              }),
              first: vi.fn().mockResolvedValue(mockEmployer),
            },
            JobSeekerProfile: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockCandidateProfile.id || filter.userId === candidateUser.id) {
                    return mockCandidateProfile;
                  }
                  return null;
                }),
              })),
            },
            User: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === candidateUser.id) return candidateUser;
                  if (filter.id === employerUser.id) return employerUser;
                  return null;
                }),
              })),
            },
            Job: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockJob),
              }),
            },
            JobApplication: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockApplication),
                update: vi.fn().mockResolvedValue({ count: 1 }),
              }),
            },
            ApplicationStatusHistory: {
              create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
            },
            JobInterview: {
              create: vi.fn().mockImplementation(async (data) => ({
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockInterview.id) return { ...mockInterview };
                  return null;
                }),
                all: vi.fn().mockResolvedValue([mockInterview]),
                update: interviewUpdateMock,
              })),
            },
            CandidateNote: {
              create: vi.fn().mockResolvedValue({ id: 'note-1' }),
            },
          },
        },
      },
    };

    service = new InterviewsService(mockPrisma, mockNotifications);
  });

  describe('scheduleInterview', () => {
    it('should schedule an interview, advance status, and notify candidate', async () => {
      const res = await service.scheduleInterview(employerUser, {
        applicationId: 'app-1',
        title: 'Initial Screening',
        startTime,
        endTime,
        meetingLink: 'https://meet.google.com/xyz',
      });

      expect(res).toBeDefined();
      expect(res.title).toBe('Initial Screening');
      expect(res.candidate?.name).toBe('Jane Doe');
      expect(mockPrisma.client.orm.public.JobInterview.create).toHaveBeenCalled();
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalled();
    });

    it('should throw BadRequestException if startTime >= endTime', async () => {
      await expect(
        service.scheduleInterview(employerUser, {
          applicationId: 'app-1',
          title: 'Initial Screening',
          startTime: endTime,
          endTime: startTime,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if job belongs to another employer', async () => {
      mockPrisma.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'job-1', employerId: 'other-emp-id' }),
      });

      await expect(
        service.scheduleInterview(employerUser, {
          applicationId: 'app-1',
          title: 'Initial Screening',
          startTime,
          endTime,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should auto-create Daily.co video meeting room if no link is provided', async () => {
      process.env.DAILY_DOMAIN = 'fruitful.daily.co';

      const res = await service.scheduleInterview(employerUser, {
        applicationId: 'app-1',
        title: 'Video Call Interview',
        startTime,
        endTime,
        interviewType: 'video' as any,
      });

      expect(res.meetingLink).toContain('fruitful.daily.co');
      delete process.env.DAILY_DOMAIN;
    });
  });

  describe('listInterviews', () => {
    it('should list interviews for employer with candidate details', async () => {
      const res = await service.listInterviews(employerUser, { status: 'scheduled' });
      expect(res.count).toBe(1);
      expect(res.interviews[0].title).toBe('System Design Interview');
    });

    it('should list interviews for candidate (job seeker)', async () => {
      const res = await service.listInterviews(candidateUser, { timeframe: 'all' });
      expect(res.count).toBe(1);
    });
  });

  describe('getInterviewById', () => {
    it('should retrieve enriched interview by id with googleCalendarUrl', async () => {
      const res = await service.getInterviewById(employerUser, 'interview-1');
      expect(res.id).toBe('interview-1');
      expect(res.job?.title).toBe('Lead Architect');
      expect(res.googleCalendarUrl).toBeDefined();
      expect(res.googleCalendarUrl).toContain('calendar.google.com/calendar/render');
      expect(res.googleCalendarUrl).toContain('action=TEMPLATE');
    });

    it('should throw NotFoundException if interview does not exist', async () => {
      await expect(service.getInterviewById(employerUser, 'missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateInterview', () => {
    it('should reschedule interview and notify candidate when time changes', async () => {
      const newStart = new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();
      const newEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          ...mockInterview,
          startTime: newStart,
          endTime: newEnd,
          status: 'rescheduled',
        }),
        update: vi.fn().mockResolvedValue({ count: 1 }),
      });

      const res = await service.updateInterview(employerUser, 'interview-1', {
        startTime: newStart,
        endTime: newEnd,
      });

      expect(res.status).toBe('rescheduled');
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalled();
    });
  });

  describe('cancelInterview', () => {
    it('should cancel interview and notify candidate', async () => {
      const res = await service.cancelInterview(employerUser, 'interview-1', {
        cancellationReason: 'Candidate accepted another offer',
      });

      expect(res.success).toBe(true);
      expect(mockNotifications.sendInterviewCancellationNotification).toHaveBeenCalled();
    });
  });

  describe('completeInterview', () => {
    it('should complete interview, store rating, and create candidate note', async () => {
      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          ...mockInterview,
          status: 'completed',
          rating: 5,
          feedbackSummary: 'Exceptional system architecture understanding.',
        }),
        update: vi.fn().mockResolvedValue({ count: 1 }),
      });

      const res = await service.completeInterview(employerUser, 'interview-1', {
        rating: 5,
        feedbackSummary: 'Exceptional system architecture understanding.',
        createCandidateNote: true,
      });

      expect(res?.status).toBe('completed');
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalled();
    });
  });

  describe('getIcsCalendarInvite', () => {
    it('should return standard RFC 5545 iCalendar content', async () => {
      const ics = await service.getIcsCalendarInvite(employerUser, 'interview-1');
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('System Design Interview');
      expect(ics).toContain('END:VCALENDAR');
    });
  });

  describe('sendInterviewReminder & triggerDueReminders', () => {
    it('should manually send interview reminder', async () => {
      const res = await service.sendInterviewReminder(employerUser, 'interview-1');
      expect(res.success).toBe(true);
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalled();
    });

    it('should trigger automated due reminders based on time windows', async () => {
      // Setup interview starting in 30 minutes (triggers 1h window)
      const in30min = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const in90min = new Date(Date.now() + 90 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([
          {
            ...mockInterview,
            startTime: in30min,
            endTime: in90min,
            reminderSent1h: false,
          },
        ]),
        update: vi.fn().mockResolvedValue({ count: 1 }),
      });

      const res = await service.triggerDueReminders();
      expect(res.processed1h).toBe(1);
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalled();
    });
  });

  describe('Conflict Detection & Scheduling Intelligence', () => {
    it('should detect scheduling conflicts for overlapping interviews', async () => {
      const conflictStart = new Date(new Date(startTime).getTime() + 15 * 60 * 1000);
      const conflictEnd = new Date(new Date(endTime).getTime() + 15 * 60 * 1000);

      const check = await service.checkSchedulingConflict(
        conflictStart,
        conflictEnd,
        'cand-profile-1',
        ['user-emp-1'],
      );

      expect(check.hasConflict).toBe(true);
      expect(check.conflicts.length).toBeGreaterThan(0);
      expect(check.conflicts[0].interviewId).toBe('interview-1');
    });

    it('should return no conflict when time slots do not overlap', async () => {
      const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

      const check = await service.checkSchedulingConflict(
        futureStart,
        futureEnd,
        'cand-profile-1',
        ['user-emp-1'],
      );

      expect(check.hasConflict).toBe(false);
      expect(check.conflicts.length).toBe(0);
    });

    it('should allow scheduling conflict override when allowOverlap is true', async () => {
      const res = await service.scheduleInterview(employerUser, {
        applicationId: 'app-1',
        title: 'Overlapping Strategy Session',
        startTime,
        endTime,
        allowOverlap: true,
      });

      expect(res).toBeDefined();
      expect(res.title).toBe('Overlapping Strategy Session');
    });
  });

  describe('Availability & Slot Finder', () => {
    it('should generate available interview slots across date range in working hours', async () => {
      // Mock no existing interviews on the query day
      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const yyyy = futureDate.getFullYear();
      const mm = (futureDate.getMonth() + 1).toString().padStart(2, '0');
      const dd = futureDate.getDate().toString().padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const res = await service.getAvailabilitySlots(employerUser, {
        startDate: dateStr,
        endDate: dateStr,
        slotDurationMinutes: 60,
        workingHoursStart: '09:00',
        workingHoursEnd: '12:00',
        timezone: 'Africa/Nairobi',
        candidateTimezone: 'America/New_York',
      });

      expect(res.timezone).toBe('Africa/Nairobi');
      expect(res.candidateTimezone).toBe('America/New_York');
      expect(res.totalAvailableSlots).toBeGreaterThan(0);
      expect(res.slots[0]).toHaveProperty('startTimeUtc');
      expect(res.slots[0]).toHaveProperty('employerLocal');
      expect(res.slots[0]).toHaveProperty('candidateLocal');
    });
  });

  describe('Calendar View & Calendar Links', () => {
    it('should return calendar view grouped by localized day', async () => {
      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockInterview]),
      });

      const res = await service.getCalendarView(employerUser, { timezone: 'Africa/Nairobi' });

      expect(res.timezone).toBe('Africa/Nairobi');
      expect(res.totalInterviews).toBe(1);
      expect(res.daysCount).toBe(1);
      expect(res.calendar[0].interviews[0].title).toBe('System Design Interview');
      expect(res.calendar[0].interviews[0].localTime.timezone).toBe('Africa/Nairobi');
    });

    it('should return 1-click web calendar links for Google, Outlook, Yahoo, and iCal', async () => {
      const res = await service.getCalendarLinks(employerUser, 'interview-1');

      expect(res.interviewId).toBe('interview-1');
      expect(res.links?.google).toContain('calendar.google.com');
      expect(res.links?.outlook).toContain('outlook.live.com');
      expect(res.links?.yahoo).toContain('calendar.yahoo.com');
      expect(res.links?.ics).toBe('/api/v1/interviews/interview-1/ics');
    });
  });

  describe('Candidate Self-Service', () => {
    it('should allow candidate to confirm interview attendance', async () => {
      const res = await service.candidateConfirmInterview(candidateUser, 'interview-1');

      expect(res.success).toBe(true);
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining('[Candidate Confirmed]'),
        }),
      );
    });

    it('should allow candidate to submit a reschedule request', async () => {
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await service.candidateRequestReschedule(candidateUser, 'interview-1', {
        reason: 'Family emergency, need to reschedule',
        proposedTime1: nextWeek,
        candidateTimezone: 'Europe/London',
      });

      expect(res.success).toBe(true);
      expect(res.rescheduleRequest.reason).toBe('Family emergency, need to reschedule');
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: expect.stringContaining('[Candidate Reschedule Request]'),
        }),
      );
    });

    it('should allow candidate to directly reschedule to an open slot', async () => {
      const newStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const newEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 3600000).toISOString();

      const res = await service.candidateRescheduleInterview(candidateUser, 'interview-1', {
        startTime: newStart,
        endTime: newEnd,
        reason: 'Shifted schedule',
      });

      expect(res).toBeDefined();
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rescheduled',
          rescheduledReason: 'Shifted schedule',
          reminderSent24h: false,
          reminderSent1h: false,
        }),
      );
    });

    it('should allow candidate to cancel their own interview', async () => {
      const res = await service.candidateCancelInterview(candidateUser, 'interview-1', {
        reason: 'Accepted another role',
      });

      expect(res.success).toBe(true);
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Accepted another role',
          cancelledBy: 'candidate',
        }),
      );
    });
  });

  describe('Employer Rescheduling & Cancellation Workflows', () => {
    it('should reschedule interview, reset reminders, increment sequence and log audit note', async () => {
      const newStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      const newEnd = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3600000).toISOString();

      const res = await service.rescheduleInterview(employerUser, 'interview-1', {
        startTime: newStart,
        endTime: newEnd,
        reason: 'Interviewer schedule conflict',
      });

      expect(res).toBeDefined();
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rescheduled',
          rescheduledCount: 1,
          reminderSent24h: false,
          reminderSent1h: false,
          reminderSent15m: false,
        }),
      );
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalled();
    });

    it('should cancel interview, record cancelledBy and log audit note', async () => {
      const res = await service.cancelInterview(employerUser, 'interview-1', {
        cancellationReason: 'Position filled internally',
      });

      expect(res.success).toBe(true);
      expect(interviewUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Position filled internally',
          cancelledBy: 'employer',
        }),
      );
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalled();
    });
  });

  describe('Automated and Manual Reminders', () => {
    it('should delegate triggerDueReminders to remindersService if available', async () => {
      const mockRemindersService = {
        triggerDueReminders: vi.fn().mockResolvedValue({ processed24h: 2, processed1h: 1, totalProcessed: 3 }),
        getDueReminders: vi.fn().mockResolvedValue([]),
        sendManualReminder: vi.fn().mockResolvedValue({ success: true }),
      };

      const customService = new InterviewsService(
        mockPrisma,
        mockNotifications,
        undefined,
        undefined,
        mockRemindersService as any,
      );

      const res = await customService.triggerDueReminders();
      expect(mockRemindersService.triggerDueReminders).toHaveBeenCalled();
      expect(res.processed24h).toBe(2);
    });

    it('should preview due reminders', async () => {
      const mockRemindersService = {
        triggerDueReminders: vi.fn(),
        getDueReminders: vi.fn().mockResolvedValue([{ id: 'int-1', dueTypes: ['24h'] }]),
        sendManualReminder: vi.fn(),
      };

      const customService = new InterviewsService(
        mockPrisma,
        mockNotifications,
        undefined,
        undefined,
        mockRemindersService as any,
      );

      const res = await customService.getDueReminders(employerUser, 120);
      expect(mockRemindersService.getDueReminders).toHaveBeenCalledWith(employerUser, 120);
      expect(res).toHaveLength(1);
    });

    it('should send manual reminder', async () => {
      const mockRemindersService = {
        triggerDueReminders: vi.fn(),
        getDueReminders: vi.fn(),
        sendManualReminder: vi.fn().mockResolvedValue({ success: true, message: 'Dispatched' }),
      };

      const customService = new InterviewsService(
        mockPrisma,
        mockNotifications,
        undefined,
        undefined,
        mockRemindersService as any,
      );

      const res = await customService.sendManualReminder(employerUser, 'interview-1', {
        customMessage: 'Please join 5 mins early',
      });
      expect(mockRemindersService.sendManualReminder).toHaveBeenCalledWith(
        employerUser,
        'interview-1',
        { customMessage: 'Please join 5 mins early' },
      );
      expect(res.success).toBe(true);
    });
  });

  describe('Timezone endpoints', () => {
    it('should return supported timezones list', () => {
      const res = service.getTimezoneList();
      expect(res.count).toBeGreaterThan(20);
      expect(res.timezones[0]).toHaveProperty('value');
      expect(res.timezones[0]).toHaveProperty('offset');
    });

    it('should convert timestamp between two timezones', () => {
      const res = service.convertTimezone({
        timestamp: '2026-10-15T10:00:00.000Z',
        fromTimezone: 'UTC',
        toTimezone: 'Africa/Nairobi',
      });

      expect(res.source.timeString).toBe('10:00 AM');
      expect(res.target.timeString).toBe('1:00 PM');
      expect(res.difference.deltaHours).toBe(3);
    });
  });
});
