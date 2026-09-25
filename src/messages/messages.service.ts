import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';
import { StorageService, type UploadedFile } from '../storage/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MessagesGateway } from './messages.gateway.js';
import type {
  CreateConversationDto,
  SendMessageDto,
  QueryConversationsDto,
  QueryMessagesDto,
  UpdateConversationStatusDto,
  ReportMessageDto,
  ReviewReportDto,
  QueryReportsDto,
} from './dto/index.js';

export interface ParticipantInfo {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  profileId: string;
  titleOrCompany?: string | null;
  isOnline?: boolean;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => MessagesGateway))
    private readonly messagesGateway?: MessagesGateway,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
    @Optional()
    @Inject(forwardRef(() => StorageService))
    private readonly storageService?: StorageService,
  ) {}

  // ==========================================
  // 1. CONVERSATION MANAGEMENT
  // ==========================================

  /**
   * Start a new conversation or retrieve an existing conversation thread between employer & candidate.
   */
  async createOrGetConversation(user: AuthUser, dto: CreateConversationDto) {
    let employerProfileId = dto.employerId;
    let jobSeekerProfileId = dto.jobSeekerId;

    if (user.role === Role.EMPLOYER) {
      const employerProfile = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId: user.id })
        .first();

      if (!employerProfile) {
        throw new NotFoundException('Employer profile not found. Please complete employer registration.');
      }
      employerProfileId = employerProfile.id;

      if (!jobSeekerProfileId) {
        throw new BadRequestException('jobSeekerId is required when initiating a conversation as an employer.');
      }
    } else if (user.role === Role.JOB_SEEKER) {
      const jobSeekerProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();

      if (!jobSeekerProfile) {
        throw new NotFoundException('Job seeker profile not found. Please complete your profile.');
      }
      jobSeekerProfileId = jobSeekerProfile.id;

      if (!employerProfileId) {
        throw new BadRequestException('employerId is required when initiating a conversation as a job seeker.');
      }
    } else if (user.role === Role.ADMIN) {
      if (!employerProfileId || !jobSeekerProfileId) {
        throw new BadRequestException('Admins must provide both employerId and jobSeekerId.');
      }
    }

    if (!employerProfileId || !jobSeekerProfileId) {
      throw new BadRequestException('Both employerId and jobSeekerId are required.');
    }

    // Verify both profiles exist
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: employerProfileId })
      .first();

    if (!employer) {
      throw new NotFoundException(`Employer profile #${employerProfileId} not found.`);
    }

    const jobSeeker = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: jobSeekerProfileId })
      .first();

    if (!jobSeeker) {
      throw new NotFoundException(`Job seeker profile #${jobSeekerProfileId} not found.`);
    }

    // Check for existing conversation
    let conversation = await this.prisma.client.orm.public.Conversation
      .where({
        employerId: employerProfileId,
        jobSeekerId: jobSeekerProfileId,
      })
      .first();

    const nowIso = new Date().toISOString();

    if (!conversation) {
      const conversationId = randomUUID();
      await this.prisma.client.orm.public.Conversation.create({
        id: conversationId,
        employerId: employerProfileId,
        jobSeekerId: jobSeekerProfileId,
        jobId: dto.jobId || null,
        status: 'active',
        lastMessageAt: dto.initialMessage ? nowIso : null,
      });

      conversation = await this.prisma.client.orm.public.Conversation
        .where({ id: conversationId })
        .first();

      this.logger.log(`Created new conversation #${conversationId} between employer ${employerProfileId} and seeker ${jobSeekerProfileId}`);

      // If initial message was supplied, send it now
      if (dto.initialMessage) {
        await this.sendMessage(user, conversation!.id, {
          content: dto.initialMessage,
        });
      }
    }

    return this.enrichConversation(conversation!, user);
  }

  /**
   * List conversations for the authenticated user with unread counts and last message.
   */
  async listConversations(user: AuthUser, query?: QueryConversationsDto) {
    let employerProfileId: string | undefined;
    let jobSeekerProfileId: string | undefined;

    if (user.role === Role.EMPLOYER) {
      const emp = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId: user.id })
        .first();
      if (!emp) return { count: 0, total: 0, page: 1, limit: 20, totalPages: 0, conversations: [] };
      employerProfileId = emp.id;
    } else if (user.role === Role.JOB_SEEKER) {
      const js = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();
      if (!js) return { count: 0, total: 0, page: 1, limit: 20, totalPages: 0, conversations: [] };
      jobSeekerProfileId = js.id;
    }

    let collection = this.prisma.client.orm.public.Conversation;

    let all = await collection.all();

    // Filter by role participant
    if (employerProfileId) {
      all = all.filter((c) => c.employerId === employerProfileId);
    } else if (jobSeekerProfileId) {
      all = all.filter((c) => c.jobSeekerId === jobSeekerProfileId);
    }

    // Filter by status
    if (query?.status && query.status !== 'all') {
      all = all.filter((c) => c.status === query.status);
    }

    // Order by lastMessageAt desc, then updatedAt desc
    all.sort((a, b) => {
      const timeA = new Date(a.lastMessageAt || a.updatedAt).getTime();
      const timeB = new Date(b.lastMessageAt || b.updatedAt).getTime();
      return timeB - timeA;
    });

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const total = all.length;
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    const enriched = await Promise.all(
      paginated.map((c) => this.enrichConversation(c, user)),
    );

    // Optional text search on participant names
    let finalItems = enriched;
    if (query?.search) {
      const q = query.search.toLowerCase();
      finalItems = enriched.filter(
        (c) =>
          c.otherParticipant?.name?.toLowerCase().includes(q) ||
          c.otherParticipant?.titleOrCompany?.toLowerCase().includes(q) ||
          c.lastMessage?.content?.toLowerCase().includes(q),
      );
    }

    return {
      count: finalItems.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      conversations: finalItems,
    };
  }

  /**
   * Retrieve conversation details by ID, validating participant permission.
   */
  async getConversationById(user: AuthUser, conversationId: string) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to view this conversation.');
    }

    return this.enrichConversation(conversation, user);
  }

  /**
   * Update conversation status (active, archived, blocked).
   */
  async updateConversationStatus(
    user: AuthUser,
    conversationId: string,
    dto: UpdateConversationStatusDto,
  ) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to modify this conversation.');
    }

    await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .update({
        status: dto.status,
      });

    const updated = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    this.messagesGateway?.emitToConversation(conversationId, 'conversation:status_changed', {
      conversationId,
      status: dto.status,
      updatedBy: user.id,
    });

    return this.enrichConversation(updated!, user);
  }

  // ==========================================
  // 2. MESSAGES IN CONVERSATION
  // ==========================================

  /**
   * Send a message in a conversation thread with optional file attachments.
   */
  async sendMessage(user: AuthUser, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You are not a participant in this conversation.');
    }

    if (conversation.status === 'blocked') {
      throw new ForbiddenException('Cannot send messages in a blocked conversation.');
    }

    const hasContent = dto.content && dto.content.trim().length > 0;
    const hasAttachments = dto.attachments && dto.attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      throw new BadRequestException('A message must include text content or at least one attachment.');
    }

    const messageId = randomUUID();
    const nowIso = new Date().toISOString();

    const created = await this.prisma.client.orm.public.Message.create({
      id: messageId,
      conversationId,
      senderId: user.id,
      content: dto.content?.trim() || '',
      isRead: false,
      readAt: null,
      isModerated: false,
    });

    // Create attachments if provided
    const attachmentsCreated: any[] = [];
    if (dto.attachments && dto.attachments.length > 0) {
      for (const att of dto.attachments) {
        const attachmentId = randomUUID();
        const attRecord = await this.prisma.client.orm.public.MessageAttachment.create({
          id: attachmentId,
          messageId,
          fileId: att.fileId || null,
          url: att.url,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
        });
        attachmentsCreated.push(attRecord);
      }
    }

    // Update conversation timestamp
    await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .update({
        lastMessageAt: nowIso,
      });

    // Determine recipient user ID and info
    const recipientInfo = await this.getRecipientInfo(conversation, user.id);

    const messagePayload = {
      ...created,
      sender: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      attachments: attachmentsCreated,
    };

    // 1. WebSocket Broadcast to conversation room and to recipient directly
    if (this.messagesGateway) {
      this.messagesGateway.emitToConversation(conversationId, 'message:new', messagePayload);
      if (recipientInfo?.userId) {
        this.messagesGateway.emitToUser(recipientInfo.userId, 'message:new', messagePayload);
      }
    }

    // 2. Notifications integration
    if (this.notificationsService && recipientInfo?.userId) {
      const preview = dto.content?.trim()
        ? dto.content.trim().length > 80
          ? `${dto.content.trim().slice(0, 77)}...`
          : dto.content.trim()
        : `Sent ${attachmentsCreated.length} attachment(s)`;

      const isRecipientOnline = this.messagesGateway?.isUserOnline(recipientInfo.userId) ?? false;

      await this.notificationsService.sendNewMessageNotification({
        recipientUserId: recipientInfo.userId,
        recipientEmail: recipientInfo.email,
        recipientName: recipientInfo.name,
        senderUserId: user.id,
        senderName: user.name || 'Someone',
        conversationId,
        messagePreview: preview,
        // Send email if recipient is offline
        sendEmail: !isRecipientOnline,
      });
    }

    return messagePayload;
  }

  /**
   * Get paginated messages for a conversation thread.
   */
  async getMessages(user: AuthUser, conversationId: string, query?: QueryMessagesDto) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to view messages in this conversation.');
    }

    let allMessages = await this.prisma.client.orm.public.Message
      .where({ conversationId })
      .all();

    // Filter by cursor dates if provided
    if (query?.before) {
      const beforeTime = new Date(query.before).getTime();
      allMessages = allMessages.filter((m) => new Date(m.createdAt).getTime() < beforeTime);
    }

    if (query?.after) {
      const afterTime = new Date(query.after).getTime();
      allMessages = allMessages.filter((m) => new Date(m.createdAt).getTime() > afterTime);
    }

    // Sort chronologically ascending
    allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 50));
    const page = Math.max(1, Number(query?.page) || 1);
    const total = allMessages.length;

    const offset = (page - 1) * limit;
    const paginated = allMessages.slice(offset, offset + limit);

    // Fetch attachments and senders for paginated messages
    const enrichedMessages = await Promise.all(
      paginated.map(async (msg) => {
        const attachments = await this.prisma.client.orm.public.MessageAttachment
          .where({ messageId: msg.id })
          .all();

        const sender = await this.prisma.client.orm.public.User
          .where({ id: msg.senderId })
          .first();

        return {
          ...msg,
          sender: sender
            ? {
                id: sender.id,
                name: sender.name,
                email: sender.email,
                role: sender.role,
              }
            : null,
          attachments,
        };
      }),
    );

    return {
      count: enrichedMessages.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      messages: enrichedMessages,
    };
  }

  /**
   * Mark all unread messages in a conversation as read by the current user.
   */
  async markMessagesAsRead(user: AuthUser, conversationId: string) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to modify this conversation.');
    }

    const unreadMessages = await this.prisma.client.orm.public.Message
      .where({
        conversationId,
        isRead: false,
      })
      .all();

    // Only mark messages sent by the other participant
    const messagesToMark = unreadMessages.filter((m) => m.senderId !== user.id);
    const nowIso = new Date().toISOString();

    await Promise.all(
      messagesToMark.map((m) =>
        this.prisma.client.orm.public.Message
          .where({ id: m.id })
          .update({
            isRead: true,
            readAt: nowIso,
          }),
      ),
    );

    // Broadcast read receipt via WebSocket
    if (messagesToMark.length > 0 && this.messagesGateway) {
      this.messagesGateway.emitToConversation(conversationId, 'message:read_receipt', {
        conversationId,
        readByUserId: user.id,
        readAt: nowIso,
        count: messagesToMark.length,
      });
    }

    return {
      success: true,
      markedCount: messagesToMark.length,
      readAt: nowIso,
    };
  }

  // ==========================================
  // 3. FILE ATTACHMENTS UPLOAD
  // ==========================================

  /**
   * Upload an attachment file for a conversation thread.
   */
  async uploadAttachment(user: AuthUser, conversationId: string, file: UploadedFile) {
    const conversation = await this.prisma.client.orm.public.Conversation
      .where({ id: conversationId })
      .first();

    if (!conversation) {
      throw new NotFoundException(`Conversation #${conversationId} not found.`);
    }

    const hasAccess = await this.canUserAccessConversation(user, conversationId, conversation);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have permission to upload files to this conversation.');
    }

    if (!this.storageService) {
      throw new BadRequestException('Storage service is unavailable.');
    }

    const upload = await this.storageService.uploadBuffer(file, {
      folder: `messages/${conversationId}`,
      entityType: 'message_attachment',
      entityId: conversationId,
      uploadedById: user.id,
      maxSizeBytes: 25 * 1024 * 1024, // 25MB max per message attachment
    });

    return {
      fileId: upload.metadata?.id || null,
      url: upload.secureUrl || upload.url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  // ==========================================
  // 4. MESSAGE MODERATION & REPORTING
  // ==========================================

  /**
   * Report an inappropriate or abusive message.
   */
  async reportMessage(user: AuthUser, messageId: string, dto: ReportMessageDto) {
    const message = await this.prisma.client.orm.public.Message
      .where({ id: messageId })
      .first();

    if (!message) {
      throw new NotFoundException(`Message #${messageId} not found.`);
    }

    if (message.senderId === user.id) {
      throw new BadRequestException('You cannot report your own message.');
    }

    // Check if already reported by this user
    const existing = await this.prisma.client.orm.public.MessageReport
      .where({
        messageId,
        reporterId: user.id,
      })
      .first();

    if (existing) {
      throw new ConflictException('You have already submitted a report for this message.');
    }

    const reportId = randomUUID();
    const created = await this.prisma.client.orm.public.MessageReport.create({
      id: reportId,
      messageId,
      reporterId: user.id,
      reason: dto.reason,
      details: dto.details || null,
      status: 'pending',
    });

    this.logger.warn(`Message #${messageId} reported by User #${user.id} for: ${dto.reason}`);

    // Alert platform administrators
    if (this.notificationsService) {
      await this.notificationsService.sendAdminModerationAlert({
        alertType: 'message_flagged',
        title: `Message reported for ${dto.reason}`,
        message: `A message was reported by user ${user.email}. Details: ${dto.details || 'None provided'}. Content preview: "${message.content.slice(0, 100)}"`,
        entityType: 'Message',
        entityId: messageId,
        metadata: {
          reportId,
          reporterId: user.id,
          reason: dto.reason,
          details: dto.details,
          conversationId: message.conversationId,
        },
      });
    }

    return {
      success: true,
      reportId: created.id,
      message: 'Report submitted successfully. Administrators will review it promptly.',
    };
  }

  /**
   * List reported messages for administrator review.
   */
  async listMessageReports(query?: QueryReportsDto) {
    let all = await this.prisma.client.orm.public.MessageReport.all();

    if (query?.status && query.status !== 'all') {
      all = all.filter((r) => r.status === query.status);
    }

    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const total = all.length;
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    const enriched = await Promise.all(
      paginated.map(async (report) => {
        const message = await this.prisma.client.orm.public.Message
          .where({ id: report.messageId })
          .first();

        const reporter = await this.prisma.client.orm.public.User
          .where({ id: report.reporterId })
          .first();

        let sender: any = null;
        if (message) {
          sender = await this.prisma.client.orm.public.User
            .where({ id: message.senderId })
            .first();
        }

        return {
          ...report,
          message: message
            ? {
                id: message.id,
                content: message.content,
                isModerated: message.isModerated,
                createdAt: message.createdAt,
                conversationId: message.conversationId,
                sender: sender ? { id: sender.id, name: sender.name, email: sender.email } : null,
              }
            : null,
          reporter: reporter
            ? {
                id: reporter.id,
                name: reporter.name,
                email: reporter.email,
              }
            : null,
        };
      }),
    );

    return {
      count: enriched.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      reports: enriched,
    };
  }

  /**
   * Review and resolve a message report (Admin action).
   */
  async reviewMessageReport(
    adminUser: AuthUser,
    reportId: string,
    dto: ReviewReportDto,
    ipAddress?: string,
  ) {
    const report = await this.prisma.client.orm.public.MessageReport
      .where({ id: reportId })
      .first();

    if (!report) {
      throw new NotFoundException(`Message report #${reportId} not found.`);
    }

    const message = await this.prisma.client.orm.public.Message
      .where({ id: report.messageId })
      .first();

    const nowIso = new Date().toISOString();
    const actionTaken = dto.actionTaken || 'none';

    // 1. If action is message_hidden, hide the offending message
    if (actionTaken === 'message_hidden' && message) {
      await this.prisma.client.orm.public.Message
        .where({ id: message.id })
        .update({
          isModerated: true,
          content: '[This message was removed by a moderator for violating community standards]',
        });

      this.messagesGateway?.emitToConversation(message.conversationId, 'message:moderated', {
        messageId: message.id,
        conversationId: message.conversationId,
      });
    }

    // 2. If action is user_suspended, suspend sender account
    if (actionTaken === 'user_suspended' && message) {
      await this.prisma.client.orm.public.User
        .where({ id: message.senderId })
        .update({
          status: 'suspended',
          suspendedAt: nowIso,
          suspensionReason: `Suspended due to reported message violation: ${dto.adminNotes || report.reason}`,
        });

      this.logger.warn(`User #${message.senderId} suspended by admin #${adminUser.id} via report #${reportId}`);
    }

    // 3. Update report record
    await this.prisma.client.orm.public.MessageReport
      .where({ id: reportId })
      .update({
        status: dto.status,
        reviewedById: adminUser.id,
        reviewedAt: nowIso,
        adminNotes: dto.adminNotes || null,
        actionTaken,
      });

    // 4. Record Audit Log for platform administrative actions
    try {
      await this.prisma.client.orm.public.AuditLog.create({
        id: randomUUID(),
        adminId: adminUser.id,
        adminEmail: adminUser.email,
        action: 'message_report_reviewed',
        targetEntity: 'MessageReport',
        targetId: reportId,
        details: JSON.stringify({
          actionTaken,
          status: dto.status,
          messageId: report.messageId,
          adminNotes: dto.adminNotes,
        }),
        ipAddress: ipAddress || null,
      });
    } catch (err: any) {
      this.logger.warn(`Failed to create audit log for report review: ${err?.message || String(err)}`);
    }


    const updated = await this.prisma.client.orm.public.MessageReport
      .where({ id: reportId })
      .first();

    return {
      success: true,
      report: updated,
      actionTaken,
    };
  }

  // ==========================================
  // 5. HELPER & VALIDATION METHODS
  // ==========================================

  /**
   * Determine whether a user is an authorized participant of a conversation.
   */
  async canUserAccessConversation(
    user: AuthUser,
    conversationId: string,
    existingConversation?: any,
  ): Promise<boolean> {
    if (user.role === Role.ADMIN) return true;

    const conv =
      existingConversation ||
      (await this.prisma.client.orm.public.Conversation
        .where({ id: conversationId })
        .first());

    if (!conv) return false;

    if (user.role === Role.EMPLOYER) {
      const employerProfile = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId: user.id })
        .first();
      return !!employerProfile && employerProfile.id === conv.employerId;
    }

    if (user.role === Role.JOB_SEEKER) {
      const jobSeekerProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();
      return !!jobSeekerProfile && jobSeekerProfile.id === conv.jobSeekerId;
    }

    return false;
  }

  /**
   * Find details about the other participant in the conversation.
   */
  private async getRecipientInfo(conversation: any, currentUserId: string) {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: conversation.employerId })
      .first();

    const jobSeeker = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: conversation.jobSeekerId })
      .first();

    if (!employer || !jobSeeker) return null;

    if (employer.userId === currentUserId) {
      const seekerUser = await this.prisma.client.orm.public.User
        .where({ id: jobSeeker.userId })
        .first();
      return {
        userId: jobSeeker.userId,
        email: seekerUser?.email || null,
        name: seekerUser?.name || 'Candidate',
        role: Role.JOB_SEEKER,
      };
    } else {
      const employerUser = await this.prisma.client.orm.public.User
        .where({ id: employer.userId })
        .first();
      return {
        userId: employer.userId,
        email: employerUser?.email || null,
        name: employer.name || employerUser?.name || 'Employer',
        role: Role.EMPLOYER,
      };
    }
  }

  /**
   * Enrich conversation entity with participant profiles, unread message counts, and last message.
   */
  private async enrichConversation(conv: any, currentUser: AuthUser) {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: conv.employerId })
      .first();

    const jobSeeker = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: conv.jobSeekerId })
      .first();

    let employerUser: any = null;
    if (employer) {
      employerUser = await this.prisma.client.orm.public.User
        .where({ id: employer.userId })
        .first();
    }

    let jobSeekerUser: any = null;
    if (jobSeeker) {
      jobSeekerUser = await this.prisma.client.orm.public.User
        .where({ id: jobSeeker.userId })
        .first();
    }

    // Associated Job
    let job: any = null;
    if (conv.jobId) {
      job = await this.prisma.client.orm.public.Job
        .where({ id: conv.jobId })
        .first();
    }

    // Unread count for current user
    const unreadMessages = await this.prisma.client.orm.public.Message
      .where({
        conversationId: conv.id,
        isRead: false,
      })
      .all();

    const unreadCount = unreadMessages.filter((m) => m.senderId !== currentUser.id).length;

    // Last message
    const allMessages = await this.prisma.client.orm.public.Message
      .where({ conversationId: conv.id })
      .all();

    allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const lastMessage = allMessages[0] || null;

    // Determine "other participant"
    const isEmployer = currentUser.role === Role.EMPLOYER || (employer && employer.userId === currentUser.id);

    let otherParticipant: ParticipantInfo | null = null;
    if (isEmployer && jobSeekerUser && jobSeeker) {
      const isOnline = this.messagesGateway?.isUserOnline(jobSeekerUser.id) ?? false;
      otherParticipant = {
        userId: jobSeekerUser.id,
        name: jobSeekerUser.name || 'Job Seeker',
        email: jobSeekerUser.email,
        role: Role.JOB_SEEKER,
        avatarUrl: jobSeeker.photoUrl || null,
        profileId: jobSeeker.id,
        titleOrCompany: jobSeeker.headline || null,
        isOnline,
      };
    } else if (employerUser && employer) {
      const isOnline = this.messagesGateway?.isUserOnline(employerUser.id) ?? false;
      otherParticipant = {
        userId: employerUser.id,
        name: employer.name || employerUser.name || 'Company',
        email: employerUser.email,
        role: Role.EMPLOYER,
        avatarUrl: employer.logoUrl || null,
        profileId: employer.id,
        titleOrCompany: employer.industry || null,
        isOnline,
      };
    }

    return {
      id: conv.id,
      status: conv.status,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      job: job
        ? {
            id: job.id,
            title: job.title,
            location: job.location,
          }
        : null,
      employer: employer
        ? {
            id: employer.id,
            userId: employer.userId,
            name: employer.name,
            logoUrl: employer.logoUrl,
          }
        : null,
      jobSeeker: jobSeeker
        ? {
            id: jobSeeker.id,
            userId: jobSeeker.userId,
            name: jobSeekerUser?.name || null,
            headline: jobSeeker.headline,
            photoUrl: jobSeeker.photoUrl,
          }
        : null,
      otherParticipant,
      unreadCount,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            isRead: lastMessage.isRead,
            createdAt: lastMessage.createdAt,
          }
        : null,
    };
  }
}
