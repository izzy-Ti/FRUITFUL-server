import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesGateway } from './messages.gateway.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  let mockAuthService: any;
  let mockMessagesService: any;
  let mockServer: any;

  const mockUser: AuthUser = {
    id: 'user-gw-1',
    email: 'gw@fruitful.com',
    name: 'Gateway User',
    role: Role.JOB_SEEKER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createMockSocket = (overrides: any = {}) => ({
    id: 'socket-123',
    handshake: {
      auth: { token: 'valid-token' },
      headers: { authorization: 'Bearer valid-token', cookie: '' },
    },
    data: {},
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
    broadcast: { emit: vi.fn() },
    disconnect: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    mockAuthService = {
      getSession: vi.fn().mockResolvedValue({ user: mockUser, session: { id: 's-1' } }),
    };

    mockMessagesService = {
      canUserAccessConversation: vi.fn().mockResolvedValue(true),
      sendMessage: vi.fn().mockResolvedValue({ id: 'msg-1', content: 'hello' }),
      markMessagesAsRead: vi.fn().mockResolvedValue({ success: true, markedCount: 1 }),
    };

    mockServer = {
      emit: vi.fn(),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };

    gateway = new MessagesGateway(mockAuthService, mockMessagesService);
    gateway.server = mockServer;
  });

  describe('handleConnection', () => {
    it('should authenticate client and join user personal room', async () => {
      const socket: any = createMockSocket();

      await gateway.handleConnection(socket);

      expect(mockAuthService.getSession).toHaveBeenCalled();
      expect(socket.data.user).toEqual(mockUser);
      expect(socket.data.userId).toBe(mockUser.id);
      expect(socket.join).toHaveBeenCalledWith(`user_${mockUser.id}`);
      expect(mockServer.emit).toHaveBeenCalledWith('user:status', {
        userId: mockUser.id,
        status: 'online',
      });
      expect(socket.emit).toHaveBeenCalledWith('authenticated', expect.anything());
    });

    it('should disconnect client if credentials missing', async () => {
      const socket: any = createMockSocket({
        handshake: { auth: {}, headers: {} },
      });

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', expect.anything());
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect client if session invalid or expired', async () => {
      mockAuthService.getSession.mockResolvedValueOnce(null);
      const socket: any = createMockSocket();

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid or expired session' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should disconnect client if user account is suspended', async () => {
      mockAuthService.getSession.mockResolvedValueOnce({
        user: { ...mockUser, status: 'suspended' },
      });
      const socket: any = createMockSocket();

      await gateway.handleConnection(socket);

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Account is suspended' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleDisconnect', () => {
    it('should track user offline status when last socket disconnects', async () => {
      const socket: any = createMockSocket();
      await gateway.handleConnection(socket);

      gateway.handleDisconnect(socket);

      expect(gateway.isUserOnline(mockUser.id)).toBe(false);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'user:status',
        expect.objectContaining({ userId: mockUser.id, status: 'offline' }),
      );
    });
  });

  describe('handleJoinConversation', () => {
    it('should allow authorized participant to join conversation room', async () => {
      const socket: any = createMockSocket({ data: { user: mockUser } });

      const res = await gateway.handleJoinConversation(socket, { conversationId: 'conv-1' });

      expect(res.success).toBe(true);
      expect(socket.join).toHaveBeenCalledWith('conversation_conv-1');
    });

    it('should reject join if user lacks access to conversation', async () => {
      mockMessagesService.canUserAccessConversation.mockResolvedValueOnce(false);
      const socket: any = createMockSocket({ data: { user: mockUser } });

      const res = await gateway.handleJoinConversation(socket, { conversationId: 'conv-private' });

      expect(res.success).toBe(false);
      expect(socket.join).not.toHaveBeenCalledWith('conversation_conv-private');
    });
  });

  describe('handleLeaveConversation', () => {
    it('should leave conversation room', async () => {
      const socket: any = createMockSocket({ data: { user: mockUser } });

      const res = await gateway.handleLeaveConversation(socket, { conversationId: 'conv-1' });

      expect(res.success).toBe(true);
      expect(socket.leave).toHaveBeenCalledWith('conversation_conv-1');
    });
  });


  describe('typing indicators', () => {
    it('should broadcast typing:start to room excluding sender', () => {
      const socket: any = createMockSocket({
        data: { user: mockUser, userId: mockUser.id },
      });

      gateway.handleTypingStart(socket, { conversationId: 'conv-1' });

      expect(socket.to).toHaveBeenCalledWith('conversation_conv-1');
    });

    it('should broadcast typing:stop to room excluding sender', () => {
      const socket: any = createMockSocket({
        data: { user: mockUser, userId: mockUser.id },
      });

      gateway.handleTypingStop(socket, { conversationId: 'conv-1' });

      expect(socket.to).toHaveBeenCalledWith('conversation_conv-1');
    });
  });

  describe('handleSendMessage', () => {
    it('should delegate message creation to MessagesService', async () => {
      const socket: any = createMockSocket({ data: { user: mockUser } });

      const res = await gateway.handleSendMessage(socket, {
        conversationId: 'conv-1',
        content: 'hello world',
      });

      expect(mockMessagesService.sendMessage).toHaveBeenCalledWith(
        mockUser,
        'conv-1',
        { content: 'hello world', attachments: undefined },
      );
      expect(res.success).toBe(true);
      expect(res.message).toBeDefined();
    });
  });

  describe('handleMarkAsRead', () => {
    it('should delegate mark-as-read to MessagesService', async () => {
      const socket: any = createMockSocket({ data: { user: mockUser } });

      const res = await gateway.handleMarkAsRead(socket, { conversationId: 'conv-1' });

      expect(mockMessagesService.markMessagesAsRead).toHaveBeenCalledWith(mockUser, 'conv-1');
      expect(res.success).toBe(true);
    });
  });

  describe('handleGetPresence', () => {
    it('should return presence map for requested user ids', async () => {
      const socket: any = createMockSocket();
      await gateway.handleConnection(socket); // mockUser becomes online

      const res = gateway.handleGetPresence(socket, { userIds: [mockUser.id, 'offline-user'] });

      expect(res.presence[mockUser.id].status).toBe('online');
      expect(res.presence['offline-user'].status).toBe('offline');
    });
  });
});
