import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewRemindersService } from './interview-reminders.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.service';

describe('InterviewRemindersService', () => {
  let service: InterviewRemindersService;
  let mockPrisma: any;
  let mockNotifications: any;

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
  };

  const mockCandidateUser = {
    id: 'user-cand-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
  };

  const mockCandidateProfile = {
    id: 'cand-profile-1',
    userId: 'user-cand-1',
  };

  const mockJob = {
    id: 'job-1',
    title: 'Senior Frontend Engineer',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockNotifications = {
      sendInterviewNotification: vi.fn().mockResolvedValue({ success: true }),
    };

    mockPrisma = {
      client: {
        orm: {
          public: {
            JobInterview: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
                first: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'int-1', ...data })),
              }),
            },
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockEmployer),
              }),
            },
            JobSeekerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockCandidateProfile),
              }),
            },
            User: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockCandidateUser),
                all: vi.fn().mockResolvedValue([mockCandidateUser]),
              }),
            },
            Job: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockJob),
              }),
            },
          },
        },
      },
    };

    service = new InterviewRemindersService(mockPrisma, mockNotifications);
  });

  describe('triggerDueReminders', () => {
    it('should process 15m, 1h, and 24h reminders appropriately', async () => {
      const now = Date.now();
      const in10m = new Date(now + 10 * 60 * 1000).toISOString();
      const in45m = new Date(now + 45 * 60 * 1000).toISOString();
      const in12h = new Date(now + 12 * 60 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'int-15m',
            title: 'Final Round',
            startTime: in10m,
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent15m: false,
          },
          {
            id: 'int-1h',
            title: 'Technical Screen',
            startTime: in45m,
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent1h: false,
          },
          {
            id: 'int-24h',
            title: 'Initial Screen',
            startTime: in12h,
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent24h: false,
          },
        ]),
      });

      const res = await service.triggerDueReminders();
      expect(res.processed15m).toBe(1);
      expect(res.processed1h).toBe(1);
      expect(res.processed24h).toBe(1);
      expect(res.totalProcessed).toBe(3);
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalledTimes(3);
    });

    it('should not update database flags when dryRun is true', async () => {
      const now = Date.now();
      const in10m = new Date(now + 10 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'int-dry',
            title: 'Quick Call',
            startTime: in10m,
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent15m: false,
          },
        ]),
      });

      const res = await service.triggerDueReminders({ dryRun: true });
      expect(res.processed15m).toBe(1);
      expect(res.dryRun).toBe(true);
      expect(mockNotifications.sendInterviewNotification).not.toHaveBeenCalled();
    });

    it('should skip reminders already sent', async () => {
      const now = Date.now();
      const in10m = new Date(now + 10 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'int-sent',
            title: 'Already Notified',
            startTime: in10m,
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent15m: true,
          },
        ]),
      });

      const res = await service.triggerDueReminders();
      expect(res.totalProcessed).toBe(0);
    });
  });

  describe('getDueReminders', () => {
    it('should preview upcoming interviews due for reminders', async () => {
      const now = Date.now();
      const in15m = new Date(now + 15 * 60 * 1000).toISOString();

      mockPrisma.client.orm.public.JobInterview.where.mockReturnValueOnce({
        all: vi.fn().mockResolvedValue([
          {
            id: 'int-preview',
            title: 'Architecture Review',
            startTime: in15m,
            endTime: new Date(now + 60 * 60 * 1000).toISOString(),
            timezone: 'UTC',
            candidateId: 'cand-profile-1',
            jobId: 'job-1',
            employerId: 'emp-profile-1',
            reminderSent15m: false,
          },
        ]),
      });

      const list = await service.getDueReminders(mockUser, 60);
      expect(list).toHaveLength(1);
      expect(list[0].dueTypes).toContain('15m');
      expect(list[0].candidateName).toBe('Jane Doe');
    });
  });

  describe('sendManualReminder', () => {
    it('should send immediate on-demand reminder with custom message', async () => {
      mockPrisma.client.orm.public.JobInterview.where.mockReturnValueOnce({
        first: vi.fn().mockResolvedValue({
          id: 'int-manual',
          title: 'Design Review',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          timezone: 'UTC',
          candidateId: 'cand-profile-1',
          jobId: 'job-1',
          employerId: 'emp-profile-1',
        }),
      });

      const res = await service.sendManualReminder(mockUser, 'int-manual', {
        customMessage: 'Please have Figma open',
      });

      expect(res.success).toBe(true);
      expect(mockNotifications.sendInterviewNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateInstructions: 'Please have Figma open',
          isReminder: true,
        }),
      );
    });
  });
});
