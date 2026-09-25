import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewsController } from './interviews.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('InterviewsController', () => {
  let controller: InterviewsController;
  let mockService: any;
  let mockAvailabilityService: any;
  let mockCalendarEventsService: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'employer@acme.com',
    name: 'Employer User',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      scheduleInterview: vi.fn().mockResolvedValue({ id: 'int-1', title: 'Screening' }),
      listInterviews: vi.fn().mockResolvedValue({ count: 1, interviews: [] }),
      getInterviewById: vi.fn().mockResolvedValue({ id: 'int-1', title: 'Screening' }),
      updateInterview: vi.fn().mockResolvedValue({ id: 'int-1', title: 'Rescheduled' }),
      cancelInterview: vi.fn().mockResolvedValue({ success: true }),
      completeInterview: vi.fn().mockResolvedValue({ id: 'int-1', status: 'completed' }),
      getIcsCalendarInvite: vi.fn().mockResolvedValue('BEGIN:VCALENDAR...'),
      sendInterviewReminder: vi.fn().mockResolvedValue({ success: true }),
      triggerDueReminders: vi.fn().mockResolvedValue({ processed24h: 1, processed1h: 0 }),
      checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false, conflicts: [] }),
      getAvailabilitySlots: vi.fn().mockResolvedValue({ totalAvailableSlots: 5, slots: [] }),
      getCalendarView: vi.fn().mockResolvedValue({ totalInterviews: 1, daysCount: 1, calendar: [] }),
      getCalendarLinks: vi.fn().mockResolvedValue({ interviewId: 'int-1', links: { google: 'https://calendar.google.com' } }),
      candidateConfirmInterview: vi.fn().mockResolvedValue({ success: true, message: 'Confirmed' }),
      candidateRequestReschedule: vi.fn().mockResolvedValue({ success: true, message: 'Reschedule requested' }),
      getTimezoneList: vi.fn().mockReturnValue({ count: 28, timezones: [] }),
      convertTimezone: vi.fn().mockReturnValue({ difference: { deltaHours: 3 } }),
      resendInvitationEmail: vi.fn().mockResolvedValue({ success: true, message: 'Dispatched' }),
    };

    mockAvailabilityService = {
      getAvailabilityProfile: vi.fn().mockResolvedValue({ id: 'avail-1', weeklySchedule: [] }),
      setAvailabilityProfile: vi.fn().mockResolvedValue({ id: 'avail-1', weeklySchedule: [] }),
      addDateOverride: vi.fn().mockResolvedValue({ id: 'avail-1', dateOverrides: [] }),
      removeDateOverride: vi.fn().mockResolvedValue({ id: 'avail-1', dateOverrides: [] }),
    };

    mockCalendarEventsService = {
      getEvents: vi.fn().mockResolvedValue([{ id: 'cal-1', title: 'Meeting' }]),
      createEvent: vi.fn().mockResolvedValue({ id: 'cal-1', title: 'Meeting' }),
      getEventById: vi.fn().mockResolvedValue({ id: 'cal-1', title: 'Meeting', status: 'confirmed' }),
      updateEvent: vi.fn().mockResolvedValue({ id: 'cal-1', title: 'Updated' }),
      cancelEvent: vi.fn().mockResolvedValue({ id: 'cal-1', status: 'cancelled' }),
      generateIcsForEvent: vi.fn().mockReturnValue('BEGIN:VCALENDAR...'),
    };

    const mockCalendarIntegrationsService: any = {
      listIntegrations: vi.fn().mockResolvedValue([{ provider: 'google', syncStatus: 'connected' }]),
      getAuthUrl: vi.fn().mockResolvedValue({ provider: 'google', authUrl: 'https://accounts.google.com' }),
      handleOAuthCallback: vi.fn().mockResolvedValue({ provider: 'google', syncStatus: 'connected' }),
      connectManual: vi.fn().mockResolvedValue({ provider: 'microsoft', syncStatus: 'connected' }),
      updateIntegration: vi.fn().mockResolvedValue({ provider: 'google', syncEnabled: false }),
      disconnect: vi.fn().mockResolvedValue({ success: true, message: 'Disconnected' }),
      triggerFullSync: vi.fn().mockResolvedValue({ success: true, syncedEventsCount: 2 }),
    };

    mockService.rescheduleInterview = vi.fn().mockResolvedValue({ id: 'int-1', title: 'Rescheduled' });
    mockService.candidateRescheduleInterview = vi.fn().mockResolvedValue({ id: 'int-1', title: 'Candidate Rescheduled' });
    mockService.candidateCancelInterview = vi.fn().mockResolvedValue({ success: true, message: 'Cancelled by candidate' });
    mockService.getDueReminders = vi.fn().mockResolvedValue([{ id: 'int-1', dueTypes: ['24h'] }]);
    mockService.sendManualReminder = vi.fn().mockResolvedValue({ success: true, message: 'Sent' });

    controller = new InterviewsController(
      mockService,
      mockAvailabilityService,
      mockCalendarEventsService,
      mockCalendarIntegrationsService,
    );
  });

  describe('scheduleInterview', () => {
    it('should delegate to interviewsService.scheduleInterview', async () => {
      const dto = { applicationId: 'app-1', title: 'Screening', startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z' };
      const res = await controller.scheduleInterview(mockUser, dto as any);
      expect(mockService.scheduleInterview).toHaveBeenCalledWith(mockUser, dto);
      expect(res.id).toBe('int-1');
    });
  });

  describe('checkConflicts', () => {
    it('should delegate to checkConflicts', async () => {
      const dto = { startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z', applicationId: 'app-1' };
      const res = await controller.checkConflicts(mockUser, dto);
      expect(mockService.checkConflicts).toHaveBeenCalledWith(mockUser, dto);
      expect(res.hasConflict).toBe(false);
    });
  });

  describe('getAvailabilitySlots', () => {
    it('should delegate to getAvailabilitySlots', async () => {
      const dto = { startDate: '2026-10-01', endDate: '2026-10-02', timezone: 'Africa/Nairobi' };
      const res = await controller.getAvailabilitySlots(mockUser, dto);
      expect(mockService.getAvailabilitySlots).toHaveBeenCalledWith(mockUser, dto);
      expect(res.totalAvailableSlots).toBe(5);
    });
  });

  describe('getCalendarView', () => {
    it('should delegate to getCalendarView', async () => {
      const query = { month: '2026-10', timezone: 'Africa/Nairobi' };
      const res = await controller.getCalendarView(mockUser, query);
      expect(mockService.getCalendarView).toHaveBeenCalledWith(mockUser, query);
      expect(res.totalInterviews).toBe(1);
    });
  });

  describe('listInterviews', () => {
    it('should delegate to listInterviews for employer', async () => {
      const query = { status: 'scheduled' };
      const res = await controller.listEmployerInterviews(mockUser, query);
      expect(mockService.listInterviews).toHaveBeenCalledWith(mockUser, query);
      expect(res.count).toBe(1);
    });

    it('should delegate to listInterviews for candidate', async () => {
      const query = { timeframe: 'upcoming' as const };
      const res = await controller.listCandidateInterviews(mockUser, query);
      expect(mockService.listInterviews).toHaveBeenCalledWith(mockUser, query);
      expect(res.count).toBe(1);
    });
  });

  describe('timezones', () => {
    it('should delegate to getTimezoneList', () => {
      const res = controller.getTimezones();
      expect(mockService.getTimezoneList).toHaveBeenCalled();
      expect(res.count).toBe(28);
    });

    it('should delegate to convertTimezone', () => {
      const dto = { timestamp: '2026-10-15T10:00:00Z', fromTimezone: 'UTC', toTimezone: 'Africa/Nairobi' };
      const res = controller.convertTimezone(dto);
      expect(mockService.convertTimezone).toHaveBeenCalledWith(dto);
      expect(res.difference.deltaHours).toBe(3);
    });
  });

  describe('getCalendarLinks', () => {
    it('should delegate to getCalendarLinks', async () => {
      const res = await controller.getCalendarLinks(mockUser, 'int-1');
      expect(mockService.getCalendarLinks).toHaveBeenCalledWith(mockUser, 'int-1');
      expect(res.interviewId).toBe('int-1');
    });
  });

  describe('candidate self-service', () => {
    it('should delegate candidateConfirm', async () => {
      const res = await controller.candidateConfirm(mockUser, 'int-1');
      expect(mockService.candidateConfirmInterview).toHaveBeenCalledWith(mockUser, 'int-1');
      expect(res.success).toBe(true);
    });

    it('should delegate candidateRescheduleRequest', async () => {
      const dto = { reason: 'Illness', proposedTime1: '2026-10-02T10:00:00Z' };
      const res = await controller.candidateRescheduleRequest(mockUser, 'int-1', dto);
      expect(mockService.candidateRequestReschedule).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.success).toBe(true);
    });
  });

  describe('getInterviewById', () => {
    it('should delegate to getInterviewById', async () => {
      const res = await controller.getInterviewById(mockUser, 'int-1');
      expect(mockService.getInterviewById).toHaveBeenCalledWith(mockUser, 'int-1', undefined);
      expect(res.id).toBe('int-1');
    });
  });

  describe('updateInterview', () => {
    it('should delegate to updateInterview', async () => {
      const dto = { title: 'Rescheduled' };
      const res = await controller.updateInterview(mockUser, 'int-1', dto);
      expect(mockService.updateInterview).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.title).toBe('Rescheduled');
    });
  });

  describe('cancelInterview', () => {
    it('should delegate to cancelInterview', async () => {
      const res = await controller.cancelInterview(mockUser, 'int-1', { cancellationReason: 'Postponed' });
      expect(mockService.cancelInterview).toHaveBeenCalledWith(mockUser, 'int-1', { cancellationReason: 'Postponed' });
      expect(res.success).toBe(true);
    });
  });

  describe('completeInterview', () => {
    it('should delegate to completeInterview', async () => {
      const dto = { rating: 5, feedbackSummary: 'Great' };
      const res = await controller.completeInterview(mockUser, 'int-1', dto);
      expect(mockService.completeInterview).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res?.status).toBe('completed');
    });
  });

  describe('downloadIcsCalendar', () => {
    it('should stream ics response with proper header', async () => {
      const mockRes: any = {
        setHeader: vi.fn(),
        send: vi.fn(),
      };
      await controller.downloadIcsCalendar(mockUser, 'int-1', mockRes);
      expect(mockService.getIcsCalendarInvite).toHaveBeenCalledWith(mockUser, 'int-1');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="interview-int-1.ics"',
      );
      expect(mockRes.send).toHaveBeenCalledWith('BEGIN:VCALENDAR...');
    });
  });

  describe('sendInterviewReminder & triggerRemindersBatch', () => {
    it('should delegate sendInterviewReminder', async () => {
      const res = await controller.sendInterviewReminder(mockUser, 'int-1');
      expect(mockService.sendInterviewReminder).toHaveBeenCalledWith(mockUser, 'int-1');
      expect(res.success).toBe(true);
    });

    it('should delegate triggerRemindersBatch', async () => {
      const res = await controller.triggerRemindersBatch();
      expect(mockService.triggerDueReminders).toHaveBeenCalled();
      expect(res.processed24h).toBe(1);
    });
  });

  describe('resendInterviewInvitation', () => {
    it('should delegate to interviewsService.resendInvitationEmail', async () => {
      const res = await controller.resendInterviewInvitation(mockUser, 'int-1');
      expect(mockService.resendInvitationEmail).toHaveBeenCalledWith(mockUser, 'int-1');
      expect(res.success).toBe(true);
    });
  });

  describe('reschedule and cancellation', () => {
    it('should delegate rescheduleInterview', async () => {
      const dto = { startTime: '2026-10-02T10:00:00Z', endTime: '2026-10-02T11:00:00Z', reason: 'Conflict' };
      const res = await controller.rescheduleInterview(mockUser, 'int-1', dto as any);
      expect(mockService.rescheduleInterview).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.id).toBe('int-1');
    });

    it('should delegate candidateDirectReschedule', async () => {
      const dto = { startTime: '2026-10-03T10:00:00Z', endTime: '2026-10-03T11:00:00Z' };
      const res = await controller.candidateDirectReschedule(mockUser, 'int-1', dto as any);
      expect(mockService.candidateRescheduleInterview).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.id).toBe('int-1');
    });

    it('should delegate candidateCancel', async () => {
      const dto = { reason: 'Accepted another offer' };
      const res = await controller.candidateCancel(mockUser, 'int-1', dto as any);
      expect(mockService.candidateCancelInterview).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.success).toBe(true);
    });
  });

  describe('automated and manual reminders', () => {
    it('should process due reminders', async () => {
      const res = await controller.processReminders();
      expect(mockService.triggerDueReminders).toHaveBeenCalled();
      expect(res.processed24h).toBe(1);
    });

    it('should query due reminders', async () => {
      const res = await controller.getDueReminders(mockUser, 60);
      expect(mockService.getDueReminders).toHaveBeenCalledWith(mockUser, 60);
      expect(res).toHaveLength(1);
    });

    it('should send manual reminder', async () => {
      const dto = { reminderType: 'custom' as any, customMessage: 'Please prepare your portfolio' };
      const res = await controller.sendManualReminder(mockUser, 'int-1', dto);
      expect(mockService.sendManualReminder).toHaveBeenCalledWith(mockUser, 'int-1', dto);
      expect(res.success).toBe(true);
    });
  });

  describe('calendar integrations', () => {
    it('should list calendar integrations', async () => {
      const res = await controller.listCalendarIntegrations(mockUser);
      expect(res).toHaveLength(1);
      expect(res[0].provider).toBe('google');
    });

    it('should get calendar OAuth URL', async () => {
      const res = await controller.getCalendarAuthUrl(mockUser, { provider: 'google' as any });
      expect(res?.authUrl).toBeDefined();
    });

    it('should handle calendar OAuth callback', async () => {
      const res = await controller.handleCalendarOAuthCallback(mockUser, { provider: 'google' as any, code: 'code-1' });
      expect(res?.syncStatus).toBe('connected');
    });

    it('should connect calendar manually', async () => {
      const res = await controller.connectCalendarManual(mockUser, { provider: 'microsoft' as any });
      expect(res?.provider).toBe('microsoft');
    });

    it('should update calendar integration', async () => {
      const res = await controller.updateCalendarIntegration(mockUser, 'google' as any, { syncEnabled: false });
      expect(res?.syncEnabled).toBe(false);
    });

    it('should disconnect calendar integration', async () => {
      const res = await controller.disconnectCalendarIntegration(mockUser, 'google' as any);
      expect(res?.success).toBe(true);
    });

    it('should trigger manual sync of calendar integrations', async () => {
      const res = await controller.syncCalendarIntegrations(mockUser);
      expect(res?.success).toBe(true);
      expect(res?.syncedEventsCount).toBe(2);
    });
  });

  describe('availability management', () => {
    it('should delegate getAvailabilityProfile', async () => {
      const res = await controller.getAvailabilityProfile(mockUser);
      expect(mockAvailabilityService.getAvailabilityProfile).toHaveBeenCalledWith(mockUser);
      expect(res!.id).toBe('avail-1');
    });

    it('should delegate setAvailabilityProfile', async () => {
      const dto = { weeklySchedule: [] };
      const res = await controller.setAvailabilityProfile(mockUser, dto as any);
      expect(mockAvailabilityService.setAvailabilityProfile).toHaveBeenCalledWith(mockUser, dto);
      expect(res!.id).toBe('avail-1');
    });

    it('should delegate addDateOverride', async () => {
      const dto = { date: '2026-12-25', isBlocked: true };
      const res = await controller.addDateOverride(mockUser, dto, 'int-user-1');
      expect(mockAvailabilityService.addDateOverride).toHaveBeenCalledWith(mockUser, dto, 'int-user-1');
      expect(res!.id).toBe('avail-1');
    });

    it('should delegate removeDateOverride', async () => {
      const res = await controller.removeDateOverride(mockUser, '2026-12-25', 'int-user-1');
      expect(mockAvailabilityService.removeDateOverride).toHaveBeenCalledWith(mockUser, '2026-12-25', 'int-user-1');
      expect(res!.id).toBe('avail-1');
    });

    it('should delegate getInterviewerAvailability', async () => {
      const res = await controller.getInterviewerAvailability(mockUser, 'int-user-2');
      expect(mockAvailabilityService.getAvailabilityProfile).toHaveBeenCalledWith(mockUser, 'int-user-2');
      expect(res!.id).toBe('avail-1');
    });
  });

  describe('calendar events management', () => {
    it('should delegate listCalendarEvents', async () => {
      const query = { status: 'confirmed' };
      const res = await controller.listCalendarEvents(mockUser, query);
      expect(mockCalendarEventsService.getEvents).toHaveBeenCalledWith(mockUser, query);
      expect(res).toHaveLength(1);
    });

    it('should delegate createCalendarEvent', async () => {
      const dto = { title: 'Debrief', startTime: '2026-10-10T10:00:00Z', endTime: '2026-10-10T11:00:00Z' };
      const res = await controller.createCalendarEvent(mockUser, dto as any);
      expect(mockCalendarEventsService.createEvent).toHaveBeenCalledWith(mockUser, dto);
      expect(res!.id).toBe('cal-1');
    });

    it('should delegate getCalendarEvent', async () => {
      const res = await controller.getCalendarEvent(mockUser, 'cal-1');
      expect(mockCalendarEventsService.getEventById).toHaveBeenCalledWith(mockUser, 'cal-1');
      expect(res!.id).toBe('cal-1');
    });

    it('should delegate updateCalendarEvent', async () => {
      const dto = { title: 'Updated' };
      const res = await controller.updateCalendarEvent(mockUser, 'cal-1', dto as any);
      expect(mockCalendarEventsService.updateEvent).toHaveBeenCalledWith(mockUser, 'cal-1', dto);
      expect(res!.title).toBe('Updated');
    });

    it('should delegate cancelCalendarEvent', async () => {
      const res = await controller.cancelCalendarEvent(mockUser, 'cal-1');
      expect(mockCalendarEventsService.cancelEvent).toHaveBeenCalledWith(mockUser, 'cal-1');
      expect(res!.status).toBe('cancelled');
    });

    it('should stream calendar event .ics', async () => {
      const mockRes: any = {
        setHeader: vi.fn(),
        send: vi.fn(),
      };
      await controller.downloadCalendarEventIcs(mockUser, 'cal-1', mockRes);
      expect(mockCalendarEventsService.getEventById).toHaveBeenCalledWith(mockUser, 'cal-1');
      expect(mockCalendarEventsService.generateIcsForEvent).toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="event-cal-1.ics"',
      );
      expect(mockRes.send).toHaveBeenCalledWith('BEGIN:VCALENDAR...');
    });
  });
});
