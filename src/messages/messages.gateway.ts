import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { MessagesService } from './messages.service.js';

export interface UserPresenceStatus {
  userId: string;
  status: 'online' | 'offline';
  lastSeen?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class MessagesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  /**
   * In-memory presence map: userId -> Set of connected socket IDs.
   */
  private readonly activeSockets = new Map<string, Set<string>>();

  /**
   * In-memory last seen map: userId -> ISO timestamp string.
   */
  private readonly lastSeenMap = new Map<string, string>();

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Messages WebSocket Gateway initialized.');
  }

  /**
   * Authenticate connecting clients via Bearer token in handshake auth, headers, or cookies.
   */
  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth || {};
      const headers = client.handshake.headers || {};

      let authorization =
        auth.token || headers.authorization || headers['Authorization'];
      if (authorization && !authorization.startsWith('Bearer ')) {
        authorization = `Bearer ${authorization}`;
      }

      const cookies = (headers.cookie as string) || undefined;
      const origin = (headers.origin as string) || undefined;

      if (!authorization && !cookies) {
        this.logger.debug(`Client ${client.id} missing credentials, disconnecting.`);
        client.emit('error', { message: 'Authentication credentials required' });
        client.disconnect(true);
        return;
      }

      const sessionData = await this.authService.getSession(
        cookies,
        authorization,
        origin,
      );

      if (!sessionData?.user) {
        this.logger.debug(`Client ${client.id} session invalid or expired.`);
        client.emit('error', { message: 'Invalid or expired session' });
        client.disconnect(true);
        return;
      }

      const user = sessionData.user;
      if (user.status === 'suspended') {
        client.emit('error', { message: 'Account is suspended' });
        client.disconnect(true);
        return;
      }

      // Attach user info to socket
      client.data.user = user;
      client.data.userId = user.id;

      // Join user's individual room for direct notifications
      await client.join(`user_${user.id}`);

      // Track presence
      const sockets = this.activeSockets.get(user.id) || new Set<string>();
      const wasOffline = sockets.size === 0;
      sockets.add(client.id);
      this.activeSockets.set(user.id, sockets);

      this.logger.log(`User ${user.email} (${user.id}) connected [socket: ${client.id}]`);

      // Broadcast online status to others if newly online
      if (wasOffline) {
        this.server?.emit('user:status', {
          userId: user.id,
          status: 'online',
        });
      }

      client.emit('authenticated', {
        userId: user.id,
        name: user.name,
        role: user.role,
      });
    } catch (err: any) {
      this.logger.warn(`Connection auth error for client ${client.id}: ${err?.message || err}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  /**
   * Handle socket disconnection and update presence status.
   */
  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    const sockets = this.activeSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.activeSockets.delete(userId);
        const lastSeen = new Date().toISOString();
        this.lastSeenMap.set(userId, lastSeen);

        this.logger.log(`User ${userId} went offline.`);
        this.server?.emit('user:status', {
          userId,
          status: 'offline',
          lastSeen,
        });
      }
    }
  }

  // ==========================================
  // ROOM JOIN / LEAVE
  // ==========================================

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: AuthUser = client.data?.user;
    if (!user || !data?.conversationId) {
      return { success: false, error: 'Unauthorized or missing conversationId' };
    }

    const hasAccess = await this.messagesService.canUserAccessConversation(
      user,
      data.conversationId,
    );

    if (!hasAccess) {
      return { success: false, error: 'Forbidden: not a participant of this conversation' };
    }

    await client.join(`conversation_${data.conversationId}`);
    this.logger.debug(`User ${user.id} joined room conversation_${data.conversationId}`);

    return { success: true, conversationId: data.conversationId };
  }

  @SubscribeMessage('conversation:leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (data?.conversationId) {
      await client.leave(`conversation_${data.conversationId}`);
      this.logger.debug(`Client ${client.id} left room conversation_${data.conversationId}`);
    }
    return { success: true, conversationId: data?.conversationId };
  }

  // ==========================================
  // TYPING INDICATORS
  // ==========================================

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: AuthUser = client.data?.user;
    if (!user || !data?.conversationId) return;

    client.to(`conversation_${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId: user.id,
      userName: user.name || 'Participant',
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: AuthUser = client.data?.user;
    if (!user || !data?.conversationId) return;

    client.to(`conversation_${data.conversationId}`).emit('typing:update', {
      conversationId: data.conversationId,
      userId: user.id,
      userName: user.name || 'Participant',
      isTyping: false,
    });
  }

  // ==========================================
  // REAL-TIME MESSAGING
  // ==========================================

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content?: string;
      attachments?: any[];
    },
  ) {
    const user: AuthUser = client.data?.user;
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!data?.conversationId) {
      return { success: false, error: 'conversationId is required' };
    }

    try {
      const message = await this.messagesService.sendMessage(
        user,
        data.conversationId,
        {
          content: data.content,
          attachments: data.attachments,
        },
      );

      return { success: true, message };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to send message' };
    }
  }

  @SubscribeMessage('message:read')
  async handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user: AuthUser = client.data?.user;
    if (!user || !data?.conversationId) {
      return { success: false, error: 'Unauthorized or missing conversationId' };
    }

    try {
      const result = await this.messagesService.markMessagesAsRead(
        user,
        data.conversationId,
      );

      return result;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to mark messages as read' };
    }
  }

  // ==========================================
  // PRESENCE QUERY
  // ==========================================

  @SubscribeMessage('user:presence')
  handleGetPresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userIds: string[] },
  ) {
    const userIds = data?.userIds || [];
    const result: Record<string, UserPresenceStatus> = {};

    for (const id of userIds) {
      const isOnline = (this.activeSockets.get(id)?.size ?? 0) > 0;
      result[id] = {
        userId: id,
        status: isOnline ? 'online' : 'offline',
        lastSeen: isOnline ? undefined : this.lastSeenMap.get(id),
      };
    }

    return { success: true, presence: result };
  }

  // ==========================================
  // SERVER-SIDE DISPATCH HELPERS
  // ==========================================

  /**
   * Broadcast an event to all participants in a conversation room.
   */
  emitToConversation(conversationId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`conversation_${conversationId}`).emit(event, payload);
  }

  /**
   * Emit an event directly to a specific user (across all their active devices).
   */
  emitToUser(userId: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  /**
   * Check if a specific user is currently connected.
   */
  isUserOnline(userId: string): boolean {
    return (this.activeSockets.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Get presence status for a given user.
   */
  getUserPresence(userId: string): UserPresenceStatus {
    const isOnline = this.isUserOnline(userId);
    return {
      userId,
      status: isOnline ? 'online' : 'offline',
      lastSeen: isOnline ? undefined : this.lastSeenMap.get(userId),
    };
  }

  /**
   * Get all currently online user IDs.
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.activeSockets.keys());
  }
}
