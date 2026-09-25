import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type {
  CreateInternalCommentDto,
  UpdateInternalCommentDto,
} from './dto/index.js';

export interface CommentAuthor {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface ThreadedComment {
  id: string;
  applicationId: string;
  employerId: string;
  authorId: string;
  author: CommentAuthor | null;
  parentId: string | null;
  content: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
  replies: ThreadedComment[];
}

@Injectable()
export class InternalCommentsService {
  private readonly logger = new Logger(InternalCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Post an internal comment or reply on a candidate application.
   */
  async createComment(user: AuthUser, dto: CreateInternalCommentDto) {
    const employer = await this.getEmployerProfile(user);

    // Verify application exists and belongs to employer
    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: dto.applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${dto.applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employer.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to comment on this application.');
    }

    if (dto.parentId) {
      const parent = await this.prisma.client.orm.public.InternalComment
        .where({ id: dto.parentId })
        .first();

      if (!parent || parent.applicationId !== dto.applicationId) {
        throw new NotFoundException(`Parent comment #${dto.parentId} not found in this thread.`);
      }
    }

    const commentId = randomUUID();
    const created = await this.prisma.client.orm.public.InternalComment.create({
      id: commentId,
      employerId: employer.id,
      applicationId: dto.applicationId,
      authorId: user.id,
      parentId: dto.parentId || null,
      content: dto.content.trim(),
      mentions: dto.mentions || [],
    });

    this.logger.log(`Created internal comment #${commentId} on application #${dto.applicationId} by user #${user.id}`);

    // If users were mentioned, notify them
    if (dto.mentions && dto.mentions.length > 0 && this.notificationsService) {
      for (const mention of dto.mentions) {
        try {
          const mentionedUser = await this.prisma.client.orm.public.User
            .where({ id: mention })
            .first();

          if (mentionedUser && mentionedUser.id !== user.id) {
            await (this.notificationsService as any).createNotification?.({
              userId: mentionedUser.id,
              type: 'admin_moderation_alert',
              title: `${user.name || 'A colleague'} mentioned you in a candidate discussion`,
              message: `"${dto.content.slice(0, 100)}" on candidate application #${dto.applicationId.slice(0, 8)}`,
              data: {
                commentId,
                applicationId: dto.applicationId,
                mentionedBy: user.id,
              },
            });
          }
        } catch (err: any) {
          this.logger.warn(`Failed to notify mentioned user ${mention}: ${err?.message || err}`);
        }
      }
    }

    return {
      ...created,
      author: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Retrieve threaded internal comments for a candidate application.
   */
  async listComments(user: AuthUser, applicationId: string): Promise<{ count: number; comments: ThreadedComment[] }> {
    const employer = await this.getEmployerProfile(user);

    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employer.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to view internal comments for this application.');
    }

    const rawComments = await this.prisma.client.orm.public.InternalComment
      .where({ applicationId })
      .all();

    // Fetch authors
    const authorIds = Array.from(new Set(rawComments.map((c) => c.authorId)));
    const authorsMap = new Map<string, CommentAuthor>();

    for (const authorId of authorIds) {
      const u = await this.prisma.client.orm.public.User
        .where({ id: authorId })
        .first();
      if (u) {
        authorsMap.set(u.id, {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        });
      }
    }

    // Sort chronologically ascending
    rawComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Build threaded tree
    const rootComments: ThreadedComment[] = [];
    const commentMap = new Map<string, ThreadedComment>();

    for (const c of rawComments) {
      const commentNode: ThreadedComment = {
        id: c.id,
        applicationId: c.applicationId,
        employerId: c.employerId,
        authorId: c.authorId,
        author: authorsMap.get(c.authorId) || null,
        parentId: c.parentId,
        content: c.content,
        mentions: [...(c.mentions || [])],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        replies: [],
      };
      commentMap.set(c.id, commentNode);
    }

    for (const node of commentMap.values()) {
      if (node.parentId && commentMap.has(node.parentId)) {
        commentMap.get(node.parentId)!.replies.push(node);
      } else {
        rootComments.push(node);
      }
    }

    return {
      count: rawComments.length,
      comments: rootComments,
    };
  }

  /**
   * Update an existing internal comment.
   */
  async updateComment(user: AuthUser, commentId: string, dto: UpdateInternalCommentDto) {
    const employer = await this.getEmployerProfile(user);

    const comment = await this.prisma.client.orm.public.InternalComment
      .where({ id: commentId })
      .first();

    if (!comment) {
      throw new NotFoundException(`Comment #${commentId} not found.`);
    }

    if (comment.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to modify this comment.');
    }

    if (comment.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the author can edit this comment.');
    }

    await this.prisma.client.orm.public.InternalComment
      .where({ id: commentId })
      .update({
        content: dto.content.trim(),
      });

    const updated = await this.prisma.client.orm.public.InternalComment
      .where({ id: commentId })
      .first();

    return updated;
  }

  /**
   * Delete an internal comment (and its threaded replies).
   */
  async deleteComment(user: AuthUser, commentId: string) {
    const employer = await this.getEmployerProfile(user);

    const comment = await this.prisma.client.orm.public.InternalComment
      .where({ id: commentId })
      .first();

    if (!comment) {
      throw new NotFoundException(`Comment #${commentId} not found.`);
    }

    if (comment.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to delete this comment.');
    }

    if (comment.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the author or an administrator can delete this comment.');
    }

    await this.prisma.client.orm.public.InternalComment
      .where({ id: commentId })
      .delete();

    return {
      success: true,
      message: 'Comment deleted successfully.',
    };
  }

  private async getEmployerProfile(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      const anyEmp = await this.prisma.client.orm.public.EmployerProfile.first();
      if (anyEmp) return anyEmp;
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer) {
      throw new NotFoundException('Employer profile not found. Please complete employer registration.');
    }

    return employer;
  }
}
