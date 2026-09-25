import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { Role } from '../common/enums/role.enum.js';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminUser: AuthUser = {
    id: 'admin-1',
    email: 'admin@fruitful.com',
    name: 'Super Admin',
    emailVerified: true,
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAdminService = {
    getDashboardStats: vi.fn(),
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    updateUserRole: vi.fn(),
    suspendUser: vi.fn(),
    reactivateUser: vi.fn(),
    approveUser: vi.fn(),
    listEmployers: vi.fn(),
    getEmployerById: vi.fn(),
    verifyEmployer: vi.fn(),
    listJobs: vi.fn(),
    approveJob: vi.fn(),
    rejectJob: vi.fn(),
    removeJob: vi.fn(),
    listTalentProfiles: vi.fn(),
    moderateTalentProfile: vi.fn(),
    listPortfolioProjects: vi.fn(),
    moderatePortfolioProject: vi.fn(),
    removePortfolioProject: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    vi.clearAllMocks();
  });

  describe('Dashboard', () => {
    it('should get dashboard stats', async () => {
      mockAdminService.getDashboardStats.mockResolvedValue({ totalUsers: 10 });
      const res = await controller.getDashboardStats();
      expect(res).toEqual({ totalUsers: 10 });
    });
  });

  describe('User & Account Management', () => {
    it('should list users', async () => {
      mockAdminService.listUsers.mockResolvedValue({ count: 1, users: [{ id: 'user-1' }] });
      const res = await controller.listUsers({ search: 'john' });
      expect(res.count).toBe(1);
    });

    it('should get user by id', async () => {
      mockAdminService.getUserById.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
      const res = await controller.getUserById('user-1');
      expect(res.email).toBe('user@example.com');
    });

    it('should update user role', async () => {
      mockAdminService.updateUserRole.mockResolvedValue({ role: Role.ADMIN });
      const res = await controller.updateUserRole(mockAdminUser, 'user-1', { role: Role.ADMIN });
      expect(res.role).toBe(Role.ADMIN);
    });

    it('should suspend user account', async () => {
      mockAdminService.suspendUser.mockResolvedValue({ status: 'suspended' });
      const res = await controller.suspendUser(mockAdminUser, 'user-1', { reason: 'Abuse' });
      expect(res.status).toBe('suspended');
    });

    it('should reactivate user account', async () => {
      mockAdminService.reactivateUser.mockResolvedValue({ status: 'active' });
      const res = await controller.reactivateUser(mockAdminUser, 'user-1');
      expect(res.status).toBe('active');
    });
  });

  describe('Employer Verification Review', () => {
    it('should list employers', async () => {
      mockAdminService.listEmployers.mockResolvedValue([{ id: 'emp-1' }]);
      const res = await controller.listEmployers('pending');
      expect(res.count).toBe(1);
    });

    it('should verify employer', async () => {
      mockAdminService.verifyEmployer.mockResolvedValue({ id: 'emp-1', verificationStatus: 'verified' });
      const res = await controller.verifyEmployer(mockAdminUser, 'emp-1', 'verified');
      expect(res.message).toContain('verified');
    });
  });

  describe('Job Moderation & Removal', () => {
    it('should list jobs', async () => {
      mockAdminService.listJobs.mockResolvedValue([{ id: 'job-1' }]);
      const res = await controller.listJobs({});
      expect(res).toHaveLength(1);
    });

    it('should approve job', async () => {
      mockAdminService.approveJob.mockResolvedValue({ id: 'job-1', status: 'published' });
      const res = await controller.approveJob(mockAdminUser, 'job-1');
      expect(res.message).toContain('approved');
    });

    it('should reject job', async () => {
      mockAdminService.rejectJob.mockResolvedValue({ id: 'job-1', status: 'closed' });
      const res = await controller.rejectJob(mockAdminUser, 'job-1', { reason: 'Violates policy' });
      expect(res.message).toContain('rejected');
    });

    it('should remove job', async () => {
      mockAdminService.removeJob.mockResolvedValue({ message: 'Job deleted successfully.' });
      const res = await controller.removeJob(mockAdminUser, 'job-1');
      expect(res.message).toBe('Job deleted successfully.');
    });
  });

  describe('Profile & Portfolio Moderation', () => {
    it('should list profiles', async () => {
      mockAdminService.listTalentProfiles.mockResolvedValue([{ id: 'prof-1' }]);
      const res = await controller.listTalentProfiles({});
      expect(res.count).toBe(1);
    });

    it('should moderate profile approval', async () => {
      mockAdminService.moderateTalentProfile.mockResolvedValue({ id: 'prof-1', approvalStatus: 'approved' });
      const res = await controller.moderateTalentProfile(mockAdminUser, 'prof-1', {
        approvalStatus: 'approved' as any,
      });
      expect(res.message).toContain('approved');
    });

    it('should list portfolio projects', async () => {
      mockAdminService.listPortfolioProjects.mockResolvedValue([{ id: 'proj-1' }]);
      const res = await controller.listPortfolioProjects('approved', 10);
      expect(res.count).toBe(1);
    });

    it('should moderate portfolio project', async () => {
      mockAdminService.moderatePortfolioProject.mockResolvedValue({ id: 'proj-1', moderationStatus: 'flagged' });
      const res = await controller.moderatePortfolioProject(mockAdminUser, 'proj-1', {
        status: 'flagged',
      });
      expect(res.moderationStatus).toBe('flagged');
    });

    it('should remove portfolio project', async () => {
      mockAdminService.removePortfolioProject.mockResolvedValue({ success: true });
      const res = await controller.removePortfolioProject(mockAdminUser, 'proj-1');
      expect(res.success).toBe(true);
    });
  });
});
