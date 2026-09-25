import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InternalCommentsController } from './internal-comments.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('InternalCommentsController', () => {
  let controller: InternalCommentsController;
  let mockService: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'employer@acme.com',
    name: 'Employer User',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      createComment: vi.fn().mockResolvedValue({ id: 'comment-1', content: 'Evaluation' }),
      listComments: vi.fn().mockResolvedValue({ count: 1, comments: [] }),
      updateComment: vi.fn().mockResolvedValue({ id: 'comment-1', content: 'Updated' }),
      deleteComment: vi.fn().mockResolvedValue({ success: true }),
    };

    controller = new InternalCommentsController(mockService);
  });

  describe('createComment', () => {
    it('should delegate to commentsService.createComment', async () => {
      const dto = { applicationId: 'app-1', content: 'Great match' };
      const res = await controller.createComment(mockUser, dto as any);
      expect(mockService.createComment).toHaveBeenCalledWith(mockUser, dto);
      expect(res.id).toBe('comment-1');
    });
  });

  describe('listComments', () => {
    it('should delegate to commentsService.listComments', async () => {
      const res = await controller.listComments(mockUser, 'app-1');
      expect(mockService.listComments).toHaveBeenCalledWith(mockUser, 'app-1');
      expect(res.count).toBe(1);
    });
  });

  describe('updateComment', () => {
    it('should delegate to commentsService.updateComment', async () => {
      const dto = { content: 'Updated content' };
      const res = await controller.updateComment(mockUser, 'comment-1', dto);
      expect(mockService.updateComment).toHaveBeenCalledWith(mockUser, 'comment-1', dto);
      expect(res?.content).toBe('Updated');
    });
  });

  describe('deleteComment', () => {
    it('should delegate to commentsService.deleteComment', async () => {
      const res = await controller.deleteComment(mockUser, 'comment-1');
      expect(mockService.deleteComment).toHaveBeenCalledWith(mockUser, 'comment-1');
      expect(res.success).toBe(true);
    });
  });
});
