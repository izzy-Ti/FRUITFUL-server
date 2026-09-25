import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulkActionsController } from './bulk-actions.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('BulkActionsController', () => {
  let controller: BulkActionsController;
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
      executeBulkAction: vi.fn().mockResolvedValue({
        success: true,
        action: 'status_update',
        processedCount: 2,
      }),
    };

    controller = new BulkActionsController(mockService);
  });

  describe('executeBulkAction', () => {
    it('should delegate to bulkActionsService.executeBulkAction', async () => {
      const dto = {
        action: 'status_update' as const,
        applicationIds: ['app-1', 'app-2'],
        status: 'shortlisted',
      };
      const res = await controller.executeBulkAction(mockUser, dto as any);
      expect(mockService.executeBulkAction).toHaveBeenCalledWith(mockUser, dto);
      expect(res.success).toBe(true);
    });
  });

  describe('bulkExport', () => {
    it('should delegate to bulkActionsService.executeBulkAction with action export', async () => {
      const applicationIds = ['app-1', 'app-2'];
      const res = await controller.bulkExport(mockUser, applicationIds);
      expect(mockService.executeBulkAction).toHaveBeenCalledWith(mockUser, {
        action: 'export',
        applicationIds,
      });
      expect(res.success).toBe(true);
    });
  });
});
