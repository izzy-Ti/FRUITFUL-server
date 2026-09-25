import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RejectionsController } from './rejections.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { RejectionCategory } from './dto/index.js';

describe('RejectionsController', () => {
  let controller: RejectionsController;
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
      rejectCandidate: vi.fn().mockResolvedValue({ success: true, status: 'rejected' }),
      listRejectionReasons: vi.fn().mockResolvedValue([{ code: 'skills_mismatch', label: 'Skills' }]),
      createCustomReason: vi.fn().mockResolvedValue({ code: 'custom_code', label: 'Custom' }),
      getRejectionAnalytics: vi.fn().mockResolvedValue({ totalRejected: 1 }),
    };

    controller = new RejectionsController(mockService);
  });

  describe('rejectCandidate', () => {
    it('should delegate to rejectionsService.rejectCandidate', async () => {
      const dto = { applicationId: 'app-1', reasonCode: 'skills_mismatch' };
      const res = await controller.rejectCandidate(mockUser, dto as any);
      expect(mockService.rejectCandidate).toHaveBeenCalledWith(mockUser, dto);
      expect(res.success).toBe(true);
    });
  });

  describe('listRejectionReasons', () => {
    it('should delegate to rejectionsService.listRejectionReasons', async () => {
      const res = await controller.listRejectionReasons(mockUser);
      expect(mockService.listRejectionReasons).toHaveBeenCalledWith(mockUser);
      expect(res.length).toBe(1);
    });
  });

  describe('createCustomReason', () => {
    it('should delegate to rejectionsService.createCustomReason', async () => {
      const dto = { code: 'custom_code', label: 'Custom', category: RejectionCategory.OTHER };
      const res = await controller.createCustomReason(mockUser, dto);
      expect(mockService.createCustomReason).toHaveBeenCalledWith(mockUser, dto);
      expect(res.code).toBe('custom_code');
    });
  });

  describe('getRejectionAnalytics', () => {
    it('should delegate to rejectionsService.getRejectionAnalytics', async () => {
      const res = await controller.getRejectionAnalytics(mockUser, {});
      expect(mockService.getRejectionAnalytics).toHaveBeenCalledWith(mockUser, {});
      expect(res.totalRejected).toBe(1);
    });
  });
});
