import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { NotificationType } from './notifications.types.js';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'user@fruitful.com',
    name: 'Jane Doe',
    emailVerified: true,
    role: 'job_seeker',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAdminUser: AuthUser = {
    id: 'admin-1',
    email: 'admin@fruitful.com',
    name: 'Admin User',
    emailVerified: true,
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockNotificationsService = {
    getUserNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    sendAccountVerificationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendApplicationReceivedNotification: vi.fn(),
    sendApplicationStatusChangeNotification: vi.fn(),
    sendEmployerVerificationNotification: vi.fn(),
    sendAdminModerationAlert: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    vi.clearAllMocks();
  });

  describe('Inbox Management', () => {
    it('should get user notifications', async () => {
      mockNotificationsService.getUserNotifications.mockResolvedValue({
        count: 1,
        total: 1,
        unreadCount: 1,
        notifications: [{ id: 'notif-1', title: 'Hello' }],
      });

      const res = await controller.getNotifications(mockUser, { page: 1, limit: 10 });
      expect(res.count).toBe(1);
      expect(mockNotificationsService.getUserNotifications).toHaveBeenCalledWith('user-1', { page: 1, limit: 10 });
    });

    it('should get unread count', async () => {
      mockNotificationsService.getUnreadCount.mockResolvedValue({ unreadCount: 3 });
      const res = await controller.getUnreadCount(mockUser);
      expect(res.unreadCount).toBe(3);
    });

    it('should mark single notification as read', async () => {
      mockNotificationsService.markAsRead.mockResolvedValue({ id: 'notif-1', read: true });
      const res = await controller.markAsRead(mockUser, 'notif-1');
      expect(res.notification.read).toBe(true);
      expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith('user-1', 'notif-1');
    });

    it('should mark all notifications as read', async () => {
      mockNotificationsService.markAllAsRead.mockResolvedValue({ success: true, updatedCount: 5 });
      const res = await controller.markAllAsRead(mockUser);
      expect(res.success).toBe(true);
      expect(res.updatedCount).toBe(5);
    });

    it('should delete a notification', async () => {
      mockNotificationsService.deleteNotification.mockResolvedValue({ success: true });
      const res = await controller.deleteNotification(mockUser, 'notif-1');
      expect(res.success).toBe(true);
    });
  });

  describe('Test Dispatch Endpoints (Admin)', () => {
    it('should test dispatch account verification', async () => {
      mockNotificationsService.sendAccountVerificationEmail.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.ACCOUNT_VERIFICATION,
        email: 'test@example.com',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendAccountVerificationEmail).toHaveBeenCalled();
    });

    it('should test dispatch password reset', async () => {
      mockNotificationsService.sendPasswordResetEmail.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.PASSWORD_RESET,
        email: 'test@example.com',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('should test dispatch application received', async () => {
      mockNotificationsService.sendApplicationReceivedNotification.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.APPLICATION_RECEIVED,
        jobTitle: 'Backend Dev',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendApplicationReceivedNotification).toHaveBeenCalled();
    });

    it('should test dispatch application status change', async () => {
      mockNotificationsService.sendApplicationStatusChangeNotification.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.APPLICATION_STATUS_CHANGE,
        status: 'shortlisted',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendApplicationStatusChangeNotification).toHaveBeenCalled();
    });

    it('should test dispatch employer verification', async () => {
      mockNotificationsService.sendEmployerVerificationNotification.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.EMPLOYER_VERIFICATION,
        status: 'verified',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendEmployerVerificationNotification).toHaveBeenCalled();
    });

    it('should test dispatch admin moderation alert', async () => {
      mockNotificationsService.sendAdminModerationAlert.mockResolvedValue({ success: true });
      const res = await controller.testDispatch(mockAdminUser, {
        type: NotificationType.ADMIN_MODERATION_ALERT,
        title: 'Spam alert',
      });
      expect(res.success).toBe(true);
      expect(mockNotificationsService.sendAdminModerationAlert).toHaveBeenCalled();
    });
  });
});
