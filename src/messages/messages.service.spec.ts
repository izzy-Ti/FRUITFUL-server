import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

describe('MessagesService', () => {
  let service: MessagesService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockNotifications: any;
  let mockStorage: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'employer@acme.com',
    name: 'Acme Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const seekerUser: AuthUser = {
    id: 'user-seeker-1',
    email: 'seeker@fruitful.com',
    name: 'John Seeker',
    role: Role.JOB_SEEKER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser: AuthUser = {
    id: 'user-admin-1',
    email: 'admin@fruitful.com',
    name: 'Admin User',
    role: Role.ADMIN,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const strangerUser: AuthUser = {
    id: 'user-stranger-1',
    email: 'stranger@fruitful.com',
    name: 'Stranger',
    role: Role.JOB_SEEKER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployerProfile = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corporation',
    logoUrl: 'https://example.com/logo.png',
  };

  const mockSeekerProfile = {
    id: 'seeker-profile-1',
    userId: seekerUser.id,
    headline: 'Senior Full Stack Engineer',
    photoUrl: 'https://example.com/photo.jpg',
  };

  const mockConversation = {
    id: 'conv-1',
    employerId: 'emp-profile-1',
    jobSeekerId: 'seeker-profile-1',
    jobId: 'job-1',
    status: 'active',
    lastMessageAt: '2026-09-25T10:00:00.000Z',
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
  };

  const mockMessage = {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderId: employerUser.id,
    content: 'Hello, are you available for an interview?',
    isRead: false,
    readAt: null,
    isModerated: false,
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
  };

  const createChain = (items: any[], single: any = null) => {
    const chain: any = {};
    chain.where = vi.fn().mockImplementation(() => chain);
    chain.orderBy = vi.fn().mockImplementation(() => chain);
    chain.all = vi.fn().mockResolvedValue(items);
    chain.first = vi.fn().mockImplementation((pk?: any) => {
      if (pk?.id) {
        return Promise.resolve(items.find((i) => i.id === pk.id) ?? null);
      }
      return Promise.resolve(single ?? (items[0] ?? null));
    });
    chain.update = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...(single ?? items[0]), ...data }),
    );
    chain.delete = vi.fn().mockResolvedValue({});
    chain.create = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...data, createdAt: new Date().toISOString() }),
    );
    return chain;
  };

  beforeEach(() => {
    const convChain = createChain([mockConversation], mockConversation);
    const msgChain = createChain([mockMessage], mockMessage);
    const empChain = createChain([mockEmployerProfile], mockEmployerProfile);
    const seekerChain = createChain([mockSeekerProfile], mockSeekerProfile);
    const userChain = createChain([employerUser, seekerUser, adminUser], employerUser);
    const attChain = createChain([], null);
    const reportChain = createChain([], null);
    const auditChain = createChain([], null);
    const jobChain = createChain([{ id: 'job-1', title: 'Software Engineer', location: 'Remote' }]);

    mockPrisma = {
      client: {
        orm: {
          public: {
            Conversation: convChain,
            Message: msgChain,
            EmployerProfile: empChain,
            JobSeekerProfile: seekerChain,
            User: userChain,
            MessageAttachment: attChain,
            MessageReport: reportChain,
            AuditLog: auditChain,
            Job: jobChain,
          },
        },
      },
    };

    mockGateway = {
      emitToConversation: vi.fn(),
      emitToUser: vi.fn(),
      isUserOnline: vi.fn().mockReturnValue(true),
      getUserPresence: vi.fn().mockReturnValue({ userId: 'u-1', status: 'online' }),
    };

    mockNotifications = {
      sendNewMessageNotification: vi.fn().mockResolvedValue({ success: true }),
      sendAdminModerationAlert: vi.fn().mockResolvedValue({ success: true }),
    };

    mockStorage = {
      uploadBuffer: vi.fn().mockResolvedValue({
        url: 'https://cloudinary.com/attachment.pdf',
        secureUrl: 'https://cloudinary.com/attachment.pdf',
        metadata: { id: 'file-1' },
      }),
    };

    service = new MessagesService(
      mockPrisma,
      mockGateway,
      mockNotifications,
      mockStorage,
    );
  });

  // ==========================================
  // CONVERSATIONS
  // ==========================================

  describe('createOrGetConversation', () => {
    it('should retrieve existing conversation between employer and seeker', async () => {
      const result = await service.createOrGetConversation(employerUser, {
        jobSeekerId: 'seeker-profile-1',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('conv-1');
      expect(result.employer?.id).toBe('emp-profile-1');
      expect(result.jobSeeker?.id).toBe('seeker-profile-1');
    });

    it('should throw BadRequestException if employer does not provide jobSeekerId', async () => {
      await expect(
        service.createOrGetConversation(employerUser, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if employer profile is missing', async () => {
      mockPrisma.client.orm.public.EmployerProfile.first.mockResolvedValueOnce(null);
      await expect(
        service.createOrGetConversation(employerUser, { jobSeekerId: 'seeker-profile-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if target job seeker profile does not exist', async () => {
      mockPrisma.client.orm.public.JobSeekerProfile.first.mockResolvedValueOnce(null);
      await expect(
        service.createOrGetConversation(employerUser, { jobSeekerId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow job seeker to initiate conversation with employer', async () => {
      const result = await service.createOrGetConversation(seekerUser, {
        employerId: 'emp-profile-1',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('conv-1');
    });

    it('should create new conversation if not found', async () => {
      mockPrisma.client.orm.public.Conversation.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'new-conv',
          employerId: 'emp-profile-1',
          jobSeekerId: 'seeker-profile-1',
          status: 'active',
          lastMessageAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

      const result = await service.createOrGetConversation(employerUser, {
        jobSeekerId: 'seeker-profile-1',
      });

      expect(mockPrisma.client.orm.public.Conversation.create).toHaveBeenCalled();
      expect(result.id).toBeDefined();
    });
  });

  describe('listConversations', () => {
    it('should list conversations for employer with enriched participant data', async () => {
      const res = await service.listConversations(employerUser, { page: 1, limit: 10 });
      expect(res.count).toBe(1);
      expect(res.conversations[0].id).toBe('conv-1');
      expect(res.conversations[0].otherParticipant).toBeDefined();
    });

    it('should list conversations for job seeker', async () => {
      const res = await service.listConversations(seekerUser);
      expect(res.count).toBe(1);
      expect(res.conversations[0].otherParticipant).toBeDefined();
    });

    it('should filter by status', async () => {
      const res = await service.listConversations(employerUser, { status: 'archived' });
      expect(res.count).toBe(0);
    });
  });

  describe('getConversationById', () => {
    it('should return conversation for participant', async () => {
      const result = await service.getConversationById(employerUser, 'conv-1');
      expect(result.id).toBe('conv-1');
    });

    it('should throw ForbiddenException if user is not participant or admin', async () => {
      mockPrisma.client.orm.public.JobSeekerProfile.first.mockResolvedValueOnce({
        id: 'stranger-profile',
        userId: strangerUser.id,
      });

      await expect(
        service.getConversationById(strangerUser, 'conv-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if conversation does not exist', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValueOnce(null);
      await expect(
        service.getConversationById(employerUser, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConversationStatus', () => {
    it('should update status and emit event to room', async () => {
      const res = await service.updateConversationStatus(employerUser, 'conv-1', {
        status: 'archived',
      });

      expect(mockPrisma.client.orm.public.Conversation.update).toHaveBeenCalledWith({
        status: 'archived',
      });
      expect(mockGateway.emitToConversation).toHaveBeenCalledWith(
        'conv-1',
        'conversation:status_changed',
        expect.objectContaining({ status: 'archived' }),
      );
      expect(res).toBeDefined();
    });

  });

  // ==========================================
  // MESSAGES
  // ==========================================

  describe('sendMessage', () => {
    it('should send text message, emit WS event, and send notification', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);

      const res = await service.sendMessage(employerUser, 'conv-1', {
        content: 'When are you free to chat?',
      });

      expect(res.id).toBeDefined();
      expect(res.content).toBe('When are you free to chat?');
      expect(mockPrisma.client.orm.public.Message.create).toHaveBeenCalled();
      expect(mockGateway.emitToConversation).toHaveBeenCalledWith(
        'conv-1',
        'message:new',
        expect.anything(),
      );
      expect(mockNotifications.sendNewMessageNotification).toHaveBeenCalled();
    });

    it('should support sending message with file attachments', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);

      const res = await service.sendMessage(employerUser, 'conv-1', {
        content: 'Check the attached assignment',
        attachments: [
          {
            url: 'https://cdn.example.com/brief.pdf',
            fileName: 'brief.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        ],
      });

      expect(mockPrisma.client.orm.public.MessageAttachment.create).toHaveBeenCalled();
      expect(res.attachments).toHaveLength(1);
    });

    it('should reject message with empty content and no attachments', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);

      await expect(
        service.sendMessage(employerUser, 'conv-1', { content: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject message if conversation is blocked', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue({
        ...mockConversation,
        status: 'blocked',
      });

      await expect(
        service.sendMessage(employerUser, 'conv-1', { content: 'Hello' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMessages', () => {
    it('should return paginated messages with attachments', async () => {
      const res = await service.getMessages(employerUser, 'conv-1', { page: 1, limit: 10 });
      expect(res.count).toBe(1);
      expect(res.messages[0].id).toBe('msg-1');
      expect(res.messages[0].sender).toBeDefined();
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark unread messages from other user and emit read receipt', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);
      // Candidate reading employer's message
      const res = await service.markMessagesAsRead(seekerUser, 'conv-1');

      expect(res.success).toBe(true);
      expect(res.markedCount).toBe(1);
      expect(mockPrisma.client.orm.public.Message.update).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: true }),
      );
      expect(mockGateway.emitToConversation).toHaveBeenCalledWith(
        'conv-1',
        'message:read_receipt',
        expect.objectContaining({ conversationId: 'conv-1', readByUserId: seekerUser.id }),
      );
    });

    it('should not mark messages sent by the user themselves', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);
      // Employer sent msg-1, so employer reading shouldn't mark own message
      const res = await service.markMessagesAsRead(employerUser, 'conv-1');
      expect(res.markedCount).toBe(0);
    });
  });

  // ==========================================
  // ATTACHMENTS
  // ==========================================

  describe('uploadAttachment', () => {
    it('should upload buffer to storage and return metadata', async () => {
      mockPrisma.client.orm.public.Conversation.first.mockResolvedValue(mockConversation);

      const fakeFile: any = {
        originalname: 'spec.pdf',
        mimetype: 'application/pdf',
        size: 500,
        buffer: Buffer.from('test'),
      };

      const result = await service.uploadAttachment(employerUser, 'conv-1', fakeFile);
      expect(result.url).toBe('https://cloudinary.com/attachment.pdf');
      expect(result.fileName).toBe('spec.pdf');
      expect(mockStorage.uploadBuffer).toHaveBeenCalled();
    });
  });

  // ==========================================
  // MODERATION & REPORTING
  // ==========================================

  describe('reportMessage', () => {
    it('should create report and trigger admin alert', async () => {
      mockPrisma.client.orm.public.Message.first.mockResolvedValue(mockMessage);
      mockPrisma.client.orm.public.MessageReport.first.mockResolvedValue(null);

      const res = await service.reportMessage(seekerUser, 'msg-1', {
        reason: 'harassment',
        details: 'Offensive language',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.MessageReport.create).toHaveBeenCalled();
      expect(mockNotifications.sendAdminModerationAlert).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user reports own message', async () => {
      mockPrisma.client.orm.public.Message.first.mockResolvedValue(mockMessage);

      await expect(
        service.reportMessage(employerUser, 'msg-1', { reason: 'spam' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if already reported', async () => {
      mockPrisma.client.orm.public.Message.first.mockResolvedValue(mockMessage);
      mockPrisma.client.orm.public.MessageReport.first.mockResolvedValue({ id: 'rep-existing' });

      await expect(
        service.reportMessage(seekerUser, 'msg-1', { reason: 'spam' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listMessageReports', () => {
    it('should return list of reports for admin', async () => {
      const mockReport = {
        id: 'rep-1',
        messageId: 'msg-1',
        reporterId: seekerUser.id,
        reason: 'spam',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      mockPrisma.client.orm.public.MessageReport.all.mockResolvedValueOnce([mockReport]);

      const res = await service.listMessageReports({ status: 'pending' });
      expect(res.count).toBe(1);
      expect(res.reports[0].id).toBe('rep-1');
    });
  });

  describe('reviewMessageReport', () => {
    it('should resolve report and hide message', async () => {
      const mockReport = {
        id: 'rep-1',
        messageId: 'msg-1',
        reporterId: seekerUser.id,
        reason: 'spam',
        status: 'pending',
      };
      mockPrisma.client.orm.public.MessageReport.first.mockResolvedValue(mockReport);
      mockPrisma.client.orm.public.Message.first.mockResolvedValue(mockMessage);

      const res = await service.reviewMessageReport(
        adminUser,
        'rep-1',
        {
          status: 'resolved',
          actionTaken: 'message_hidden',
          adminNotes: 'Confirmed violation',
        },
        '127.0.0.1',
      );

      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.Message.update).toHaveBeenCalledWith(
        expect.objectContaining({ isModerated: true }),
      );
      expect(mockGateway.emitToConversation).toHaveBeenCalledWith(
        'conv-1',
        'message:moderated',
        expect.anything(),
      );
      expect(mockPrisma.client.orm.public.AuditLog.create).toHaveBeenCalled();
    });

    it('should suspend user when actionTaken is user_suspended', async () => {
      const mockReport = {
        id: 'rep-1',
        messageId: 'msg-1',
        reporterId: seekerUser.id,
        reason: 'severe violation',
        status: 'pending',
      };
      mockPrisma.client.orm.public.MessageReport.first.mockResolvedValue(mockReport);
      mockPrisma.client.orm.public.Message.first.mockResolvedValue(mockMessage);

      const res = await service.reviewMessageReport(adminUser, 'rep-1', {
        status: 'resolved',
        actionTaken: 'user_suspended',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.User.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
    });
  });
});
