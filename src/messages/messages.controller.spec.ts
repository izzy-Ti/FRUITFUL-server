import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesController } from './messages.controller.js';
import { MessagesAdminController } from './messages-admin.controller.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

describe('MessagesController & MessagesAdminController', () => {
  let controller: MessagesController;
  let adminController: MessagesAdminController;
  let mockService: any;
  let mockGateway: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User One',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser: AuthUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: Role.ADMIN,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      createOrGetConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      listConversations: vi.fn().mockResolvedValue({ count: 1, conversations: [] }),
      getConversationById: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      updateConversationStatus: vi.fn().mockResolvedValue({ id: 'conv-1', status: 'archived' }),
      sendMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      getMessages: vi.fn().mockResolvedValue({ count: 1, messages: [] }),
      markMessagesAsRead: vi.fn().mockResolvedValue({ success: true, markedCount: 2 }),
      uploadAttachment: vi.fn().mockResolvedValue({ url: 'https://example.com/att.pdf' }),
      reportMessage: vi.fn().mockResolvedValue({ success: true, reportId: 'rep-1' }),
      listMessageReports: vi.fn().mockResolvedValue({ count: 1, reports: [] }),
      reviewMessageReport: vi.fn().mockResolvedValue({ success: true }),
    };

    mockGateway = {
      getUserPresence: vi.fn().mockReturnValue({ userId: 'u-1', status: 'online' }),
    };

    controller = new MessagesController(mockService, mockGateway);
    adminController = new MessagesAdminController(mockService);
  });

  describe('MessagesController', () => {
    it('should create or get conversation', async () => {
      const res = await controller.createOrGetConversation(mockUser, { jobSeekerId: 'seeker-1' });
      expect(mockService.createOrGetConversation).toHaveBeenCalledWith(mockUser, { jobSeekerId: 'seeker-1' });
      expect(res.id).toBe('conv-1');
    });

    it('should list conversations', async () => {
      const res = await controller.listConversations(mockUser, { page: 1 });
      expect(mockService.listConversations).toHaveBeenCalledWith(mockUser, { page: 1 });
      expect(res.count).toBe(1);
    });

    it('should get online status of users', async () => {
      const res = await controller.getOnlineStatus('u-1,u-2');
      expect(mockGateway.getUserPresence).toHaveBeenCalledWith('u-1');
      expect(mockGateway.getUserPresence).toHaveBeenCalledWith('u-2');
      expect(res['u-1']).toBeDefined();
    });

    it('should get conversation details', async () => {
      const res = await controller.getConversationById(mockUser, 'conv-1');
      expect(mockService.getConversationById).toHaveBeenCalledWith(mockUser, 'conv-1');
      expect(res.id).toBe('conv-1');
    });

    it('should update conversation status', async () => {
      const res = await controller.updateConversationStatus(mockUser, 'conv-1', { status: 'archived' });
      expect(mockService.updateConversationStatus).toHaveBeenCalledWith(mockUser, 'conv-1', { status: 'archived' });
      expect(res.status).toBe('archived');
    });

    it('should get messages', async () => {
      const res = await controller.getMessages(mockUser, 'conv-1', { page: 1 });
      expect(mockService.getMessages).toHaveBeenCalledWith(mockUser, 'conv-1', { page: 1 });
      expect(res.count).toBe(1);
    });

    it('should send a message', async () => {
      const res = await controller.sendMessage(mockUser, 'conv-1', { content: 'Hi' });
      expect(mockService.sendMessage).toHaveBeenCalledWith(mockUser, 'conv-1', { content: 'Hi' });
      expect(res.id).toBe('msg-1');
    });

    it('should mark messages as read', async () => {
      const res = await controller.markMessagesAsRead(mockUser, 'conv-1');
      expect(mockService.markMessagesAsRead).toHaveBeenCalledWith(mockUser, 'conv-1');
      expect(res.markedCount).toBe(2);
    });

    it('should upload attachment', async () => {
      const fakeFile: any = { originalname: 'doc.pdf', buffer: Buffer.from('') };
      const res = await controller.uploadAttachment(mockUser, 'conv-1', fakeFile);
      expect(mockService.uploadAttachment).toHaveBeenCalledWith(mockUser, 'conv-1', fakeFile);
      expect(res.url).toBe('https://example.com/att.pdf');
    });

    it('should report a message', async () => {
      const res = await controller.reportMessage(mockUser, 'msg-1', { reason: 'spam' });
      expect(mockService.reportMessage).toHaveBeenCalledWith(mockUser, 'msg-1', { reason: 'spam' });
      expect(res.reportId).toBe('rep-1');
    });
  });

  describe('MessagesAdminController', () => {
    it('should list reports', async () => {
      const res = await adminController.listReports({ status: 'pending' });
      expect(mockService.listMessageReports).toHaveBeenCalledWith({ status: 'pending' });
      expect(res.count).toBe(1);
    });

    it('should review report with ip forwarding', async () => {
      const fakeReq: any = { headers: { 'x-forwarded-for': '1.2.3.4' }, ip: '127.0.0.1' };
      const res = await adminController.reviewReport(
        adminUser,
        'rep-1',
        { status: 'resolved', actionTaken: 'message_hidden' },
        fakeReq,
      );
      expect(mockService.reviewMessageReport).toHaveBeenCalledWith(
        adminUser,
        'rep-1',
        { status: 'resolved', actionTaken: 'message_hidden' },
        '1.2.3.4',
      );
      expect(res.success).toBe(true);
    });
  });
});
