import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InternalCommentsService } from './internal-comments.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('InternalCommentsService', () => {
  let service: InternalCommentsService;
  let mockPrisma: any;
  let mockNotifications: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'hr@acme.com',
    name: 'Acme Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const colleagueUser: AuthUser = {
    id: 'user-emp-2',
    email: 'techlead@acme.com',
    name: 'Tech Lead',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser: AuthUser = {
    id: 'user-admin',
    email: 'admin@fruitful.com',
    name: 'Fruitful Admin',
    role: Role.ADMIN,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corp',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-profile-1',
    title: 'Senior Software Engineer',
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'seeker-profile-1',
    status: 'under_review',
  };

  const mockComment = {
    id: 'comment-1',
    employerId: 'emp-profile-1',
    applicationId: 'app-1',
    authorId: employerUser.id,
    parentId: null,
    content: 'Reviewing portfolio projects.',
    mentions: ['user-emp-2'],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };

  beforeEach(() => {
    mockNotifications = {
      createNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => mockEmployer),
              }),
              first: vi.fn().mockResolvedValue(mockEmployer),
            },
            JobApplication: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockApplication.id) return mockApplication;
                  return null;
                }),
              })),
            },
            Job: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockJob.id) return mockJob;
                  return null;
                }),
              })),
            },
            InternalComment: {
              create: vi.fn().mockImplementation(async (data) => ({
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockComment.id) return { ...mockComment };
                  return null;
                }),
                all: vi.fn().mockResolvedValue([mockComment]),
                update: vi.fn().mockResolvedValue({ count: 1 }),
                delete: vi.fn().mockResolvedValue({ count: 1 }),
              })),
            },
            User: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === employerUser.id) return employerUser;
                  if (filter.id === colleagueUser.id) return colleagueUser;
                  if (filter.id === adminUser.id) return adminUser;
                  return null;
                }),
              })),
            },
          },
        },
      },
    };

    service = new InternalCommentsService(mockPrisma, mockNotifications);
  });

  describe('createComment', () => {
    it('should create root internal comment and dispatch mention notification', async () => {
      const res = await service.createComment(employerUser, {
        applicationId: 'app-1',
        content: 'Check out his GitHub repos @TechLead',
        mentions: ['user-emp-2'],
      });

      expect(res).toBeDefined();
      expect(res.content).toBe('Check out his GitHub repos @TechLead');
      expect(res.author.id).toBe(employerUser.id);
      expect(mockNotifications.createNotification).toHaveBeenCalled();
    });

    it('should create threaded reply to existing comment', async () => {
      const res = await service.createComment(colleagueUser, {
        applicationId: 'app-1',
        parentId: 'comment-1',
        content: 'Looks solid, good code structure.',
      });

      expect(res.parentId).toBe('comment-1');
      expect(mockPrisma.client.orm.public.InternalComment.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if application does not exist', async () => {
      await expect(
        service.createComment(employerUser, {
          applicationId: 'non-existent-app',
          content: 'Comment',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if job does not belong to employer', async () => {
      mockPrisma.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'job-1', employerId: 'other-emp-id' }),
      });

      await expect(
        service.createComment(employerUser, {
          applicationId: 'app-1',
          content: 'Comment',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if parent comment is invalid', async () => {
      await expect(
        service.createComment(employerUser, {
          applicationId: 'app-1',
          parentId: 'invalid-parent',
          content: 'Reply to non-existent comment',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listComments', () => {
    it('should return hierarchical threaded comment tree', async () => {
      const parent = { ...mockComment, id: 'c-parent', parentId: null, createdAt: '2026-09-01T10:00:00Z' };
      const reply1 = {
        ...mockComment,
        id: 'c-reply-1',
        authorId: colleagueUser.id,
        parentId: 'c-parent',
        content: 'First reply',
        createdAt: '2026-09-01T11:00:00Z',
      };
      const reply2 = {
        ...mockComment,
        id: 'c-reply-2',
        authorId: employerUser.id,
        parentId: 'c-parent',
        content: 'Second reply',
        createdAt: '2026-09-01T12:00:00Z',
      };

      mockPrisma.client.orm.public.InternalComment.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([parent, reply1, reply2]),
      });

      const res = await service.listComments(employerUser, 'app-1');
      expect(res.count).toBe(3);
      expect(res.comments.length).toBe(1);
      expect(res.comments[0].id).toBe('c-parent');
      expect(res.comments[0].replies.length).toBe(2);
      expect(res.comments[0].replies[0].id).toBe('c-reply-1');
      expect(res.comments[0].replies[0].author?.name).toBe('Tech Lead');
    });

    it('should throw NotFoundException if application not found', async () => {
      mockPrisma.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.listComments(employerUser, 'app-not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateComment', () => {
    it('should update comment if author', async () => {
      await service.updateComment(employerUser, 'comment-1', { content: 'Updated content' });
      expect(mockPrisma.client.orm.public.InternalComment.where).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if non-author tries to update', async () => {
      await expect(
        service.updateComment(colleagueUser, 'comment-1', { content: 'Unauthorized edit' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update any comment', async () => {
      await expect(
        service.updateComment(adminUser, 'comment-1', { content: 'Admin modified' }),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteComment', () => {
    it('should allow author to delete comment', async () => {
      const res = await service.deleteComment(employerUser, 'comment-1');
      expect(res.success).toBe(true);
    });

    it('should throw ForbiddenException if non-author attempts delete', async () => {
      await expect(service.deleteComment(colleagueUser, 'comment-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow admin to delete comment', async () => {
      const res = await service.deleteComment(adminUser, 'comment-1');
      expect(res.success).toBe(true);
    });
  });
});
