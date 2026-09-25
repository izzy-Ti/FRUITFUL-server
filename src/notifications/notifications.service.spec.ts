import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { EmailService } from './email.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationType } from './notifications.types.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrismaService: any;
  let mockEmailService: any;

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Jane Doe',
    role: 'job_seeker',
  };

  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@fruitful.com',
    name: 'Admin User',
    role: 'admin',
  };

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.ACCOUNT_VERIFICATION,
    title: 'Verify your Fruitful Journey account',
    message: 'A verification link has been sent to your email address.',
    data: JSON.stringify({ email: 'user@example.com' }),
    read: false,
    readAt: null,
    emailSent: true,
    emailDeliveryStatus: 'sent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    const createMockChain = (defaultItem: any) => {
      const chain: any = {};
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.orderBy = vi.fn().mockImplementation(() => chain);
      chain.limit = vi.fn().mockImplementation(() => chain);
      chain.all = vi.fn().mockResolvedValue([defaultItem]);
      chain.first = vi.fn().mockResolvedValue(defaultItem);
      chain.update = vi.fn().mockResolvedValue(defaultItem);
      chain.delete = vi.fn().mockResolvedValue({});
      chain.create = vi.fn().mockImplementation((val: any) =>
        Promise.resolve({ id: 'notif-new', ...val, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      );
      return chain;
    };

    mockPrismaService = {
      client: {
        orm: {
          public: {
            Notification: createMockChain(mockNotification),
            User: {
              where: vi.fn().mockImplementation((cond: any) => {
                const chain: any = {};
                chain.first = vi.fn().mockResolvedValue(mockUser);
                chain.all = vi.fn().mockResolvedValue([mockAdminUser]);
                return chain;
              }),
            },
          },
        },
      },
    };

    mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'msg-1',
        recipient: 'user@example.com',
        subject: 'Fruitful Notification',
        timestamp: new Date().toISOString(),
      }),
    };

    service = new NotificationsService(
      mockPrismaService as unknown as PrismaService,
      mockEmailService as unknown as EmailService,
    );
  });

  describe('1. Account Verification Email', () => {
    it('should send account verification email and create notification record', async () => {
      const result = await service.sendAccountVerificationEmail({
        userId: 'user-1',
        email: 'user@example.com',
        name: 'Jane Doe',
        verificationUrl: 'https://fruitful.example/verify?token=abc',
        otp: '123456',
      });

      expect(result.success).toBe(true);
      expect(result.emailSent).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify your Fruitful Journey account',
        }),
      );
      expect(mockPrismaService.client.orm.public.Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.ACCOUNT_VERIFICATION,
        }),
      );
    });
  });

  describe('2. Password Reset Email', () => {
    it('should send password reset email and create notification record', async () => {
      const result = await service.sendPasswordResetEmail({
        userId: 'user-1',
        email: 'user@example.com',
        resetUrl: 'https://fruitful.example/reset?token=xyz',
      });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your Fruitful Journey password',
        }),
      );
      expect(mockPrismaService.client.orm.public.Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.PASSWORD_RESET,
        }),
      );
    });
  });

  describe('3. Application Received Notification', () => {
    it('should notify candidate and employer on application submission', async () => {
      const result = await service.sendApplicationReceivedNotification({
        candidateUserId: 'user-1',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Candidate One',
        employerUserId: 'emp-user-1',
        employerEmail: 'hiring@acme.com',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Corp',
        applicationId: 'app-1',
        jobId: 'job-1',
      });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2); // 1 for candidate, 1 for employer
      expect(mockPrismaService.client.orm.public.Notification.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('4. Application Status Change Notification', () => {
    it('should notify candidate when application stage changes', async () => {
      const result = await service.sendApplicationStatusChangeNotification({
        candidateUserId: 'user-1',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Candidate One',
        jobTitle: 'Frontend Engineer',
        companyName: 'Acme Corp',
        applicationId: 'app-1',
        newStatus: 'interviewing',
        previousStatus: 'reviewing',
        employerNotes: 'We loved your portfolio!',
      });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          subject: expect.stringContaining('Interview Scheduled'),
        }),
      );
      expect(mockPrismaService.client.orm.public.Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.APPLICATION_STATUS_CHANGE,
        }),
      );
    });
  });

  describe('5. Employer Verification Notification', () => {
    it('should notify employer when organization is verified', async () => {
      const result = await service.sendEmployerVerificationNotification({
        employerUserId: 'emp-user-1',
        employerEmail: 'founder@acme.com',
        companyName: 'Acme Corp',
        status: 'verified',
      });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'founder@acme.com',
          subject: expect.stringContaining('Organization Verified'),
        }),
      );
      expect(mockPrismaService.client.orm.public.Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'emp-user-1',
          type: NotificationType.EMPLOYER_VERIFICATION,
        }),
      );
    });

    it('should notify employer when organization is rejected with reason', async () => {
      const result = await service.sendEmployerVerificationNotification({
        employerUserId: 'emp-user-1',
        employerEmail: 'founder@acme.com',
        companyName: 'Acme Corp',
        status: 'rejected',
        rejectionReason: 'Invalid business registration license',
      });

      expect(result.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'founder@acme.com',
          subject: expect.stringContaining('Verification update'),
        }),
      );
    });
  });

  describe('6. Admin & Moderation Alerts', () => {
    it('should broadcast alert to admins and target user', async () => {
      const result = await service.sendAdminModerationAlert({
        alertType: 'user_suspended',
        title: 'Account Suspended: scammer@example.com',
        message: 'Account suspended for policy violation',
        entityType: 'User',
        entityId: 'user-bad',
        targetUserId: 'user-bad',
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('7. Interview Email Invitations & Calendar Sync', () => {
    it('should dispatch interview invitation with .ics attachment to candidate and interviewer', async () => {
      const result = await service.sendInterviewNotification({
        candidateUserId: 'user-1',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Jane Doe',
        employerName: 'Acme Corp',
        jobTitle: 'Senior Fullstack Engineer',
        interviewId: 'int-123',
        interviewTitle: 'Technical Screening',
        interviewType: 'video',
        startTime: '2026-10-15T14:00:00.000Z',
        endTime: '2026-10-15T15:00:00.000Z',
        timezone: 'America/New_York',
        candidateTimezone: 'Africa/Nairobi',
        meetingLink: 'https://fruitful.daily.co/interview-123',
        interviewerEmails: ['lead@acme.com'],
        icsAttachment: {
          filename: 'invite.ics',
          content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
        },
      });

      expect(result).toBeDefined();
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          subject: expect.stringContaining('Interview Invitation'),
          attachments: [
            expect.objectContaining({
              filename: 'invite.ics',
              contentType: 'text/calendar; charset=utf-8; method=REQUEST',
            }),
          ],
        }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'lead@acme.com',
          subject: expect.stringContaining('Interviewer Notice'),
        }),
      );
    });

    it('should dispatch rescheduled notification with updated time and attachment', async () => {
      await service.sendInterviewRescheduledNotification({
        candidateUserId: 'user-1',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Jane Doe',
        employerName: 'Acme Corp',
        jobTitle: 'Senior Fullstack Engineer',
        interviewId: 'int-123',
        interviewTitle: 'Technical Screening',
        interviewType: 'video',
        startTime: '2026-10-16T14:00:00.000Z',
        endTime: '2026-10-16T15:00:00.000Z',
        timezone: 'America/New_York',
        previousStartTime: '2026-10-15T14:00:00.000Z',
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          subject: expect.stringContaining('[Rescheduled]'),
        }),
      );
    });

    it('should dispatch cancellation notification with cancellation .ics attachment', async () => {
      await service.sendInterviewCancellationNotification({
        candidateUserId: 'user-1',
        candidateEmail: 'candidate@example.com',
        candidateName: 'Jane Doe',
        employerName: 'Acme Corp',
        jobTitle: 'Senior Fullstack Engineer',
        interviewTitle: 'Technical Screening',
        startTime: '2026-10-15T14:00:00.000Z',
        cancellationReason: 'Position filled internally',
        interviewerEmails: ['lead@acme.com'],
        icsAttachment: {
          filename: 'cancel.ics',
          content: 'BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR',
        },
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          subject: expect.stringContaining('Cancelled: Interview'),
          attachments: [
            expect.objectContaining({
              filename: 'cancel.ics',
              contentType: 'text/calendar; charset=utf-8; method=CANCEL',
            }),
          ],
        }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'lead@acme.com',
          subject: expect.stringContaining('Interviewer Notice'),
        }),
      );
    });
  });

  describe('Inbox Management', () => {
    it('should retrieve user notifications', async () => {
      const res = await service.getUserNotifications('user-1', { page: 1, limit: 10 });
      expect(res.notifications).toHaveLength(1);
      expect(res.total).toBe(1);
      expect(res.unreadCount).toBe(1);
    });

    it('should get unread count', async () => {
      const res = await service.getUnreadCount('user-1');
      expect(res.unreadCount).toBe(1);
    });

    it('should mark single notification as read', async () => {
      const res = await service.markAsRead('user-1', 'notif-1');
      expect(mockPrismaService.client.orm.public.Notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          read: true,
        }),
      );
    });

    it('should mark all notifications as read', async () => {
      const res = await service.markAllAsRead('user-1');
      expect(res.success).toBe(true);
      expect(res.updatedCount).toBe(1);
    });

    it('should delete a notification', async () => {
      const res = await service.deleteNotification('user-1', 'notif-1');
      expect(res.success).toBe(true);
      expect(mockPrismaService.client.orm.public.Notification.delete).toHaveBeenCalled();
    });
  });
});
