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
    getPlatformActivityMetrics: vi.fn(),
    getEmploymentImpactMetrics: vi.fn(),
    getAvailableReports: vi.fn(),
    exportReport: vi.fn(),
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    seedCategories: vi.fn(),
    listSkills: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    seedSkills: vi.fn(),
    listControlledData: vi.fn(),
    createControlledData: vi.fn(),
    updateControlledData: vi.fn(),
    deleteControlledData: vi.fn(),
    seedControlledData: vi.fn(),
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

  describe('Activity & Employment Impact Metrics', () => {
    it('should get platform activity metrics', async () => {
      mockAdminService.getPlatformActivityMetrics.mockResolvedValue({ timeframes: {} });
      const res = await controller.getPlatformActivityMetrics();
      expect(res.timeframes).toBeDefined();
    });

    it('should get employment impact metrics', async () => {
      mockAdminService.getEmploymentImpactMetrics.mockResolvedValue({ totalPlacements: 5 });
      const res = await controller.getEmploymentImpactMetrics();
      expect(res.totalPlacements).toBe(5);
    });
  });

  describe('Operational Reports Export', () => {
    it('should get available reports', () => {
      mockAdminService.getAvailableReports.mockReturnValue([{ id: 'jobs' }]);
      const res = controller.getAvailableReports();
      expect(res).toHaveLength(1);
    });

    it('should export report as json', async () => {
      mockAdminService.exportReport.mockResolvedValue({ format: 'json', data: [] });
      const res = await controller.exportReport('jobs', 'json');
      expect(res.format).toBe('json');
    });

    it('should export report as csv', async () => {
      mockAdminService.exportReport.mockResolvedValue({
        format: 'csv',
        filename: 'fruitful-report-jobs.csv',
        content: 'header1,header2\nval1,val2',
      });
      const mockRes = {
        setHeader: vi.fn(),
      };
      const res = await controller.exportReport('jobs', 'csv', undefined, undefined, undefined, undefined, undefined, undefined, mockRes);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res).toContain('header1,header2');
    });

    it('should throw BadRequestException if report type is missing', async () => {
      await expect(controller.exportReport('')).rejects.toThrow();
    });
  });

  describe('Controlled Platform Data Management', () => {
    it('should list and manage categories', async () => {
      mockAdminService.listCategories.mockResolvedValue([{ id: 'cat-1' }]);
      mockAdminService.createCategory.mockResolvedValue({ id: 'cat-1' });
      mockAdminService.updateCategory.mockResolvedValue({ id: 'cat-1' });
      mockAdminService.deleteCategory.mockResolvedValue({ success: true });
      mockAdminService.seedCategories.mockResolvedValue({ seededCount: 10 });

      const list = await controller.listCategories();
      expect(list.count).toBe(1);

      const created = await controller.createCategory({ name: 'Design' });
      expect(created.message).toContain('created');

      const updated = await controller.updateCategory('cat-1', { name: 'UX' });
      expect(updated.message).toContain('updated');

      const deleted = await controller.deleteCategory('cat-1');
      expect(deleted.success).toBe(true);

      const seeded = await controller.seedCategories();
      expect(seeded.seededCount).toBe(10);
    });

    it('should list and manage skills', async () => {
      mockAdminService.listSkills.mockResolvedValue([{ id: 'sk-1' }]);
      mockAdminService.createSkill.mockResolvedValue({ id: 'sk-1' });
      mockAdminService.updateSkill.mockResolvedValue({ id: 'sk-1' });
      mockAdminService.deleteSkill.mockResolvedValue({ success: true });
      mockAdminService.seedSkills.mockResolvedValue({ seededCount: 15 });

      const list = await controller.listSkills();
      expect(list.count).toBe(1);

      const created = await controller.createSkill({ name: 'Docker' });
      expect(created.message).toContain('created');

      const updated = await controller.updateSkill('sk-1', { name: 'Docker Pro' });
      expect(updated.message).toContain('updated');

      const deleted = await controller.deleteSkill('sk-1');
      expect(deleted.success).toBe(true);

      const seeded = await controller.seedSkills();
      expect(seeded.seededCount).toBe(15);
    });

    it('should list and manage controlled platform data', async () => {
      mockAdminService.listControlledData.mockResolvedValue([{ id: 'cd-1' }]);
      mockAdminService.createControlledData.mockResolvedValue({ id: 'cd-1' });
      mockAdminService.updateControlledData.mockResolvedValue({ id: 'cd-1' });
      mockAdminService.deleteControlledData.mockResolvedValue({ success: true });
      mockAdminService.seedControlledData.mockResolvedValue({ seededCount: 20 });

      const list = await controller.listControlledData();
      expect(list.count).toBe(1);

      const created = await controller.createControlledData({ key: 'remote' });
      expect(created.message).toContain('created');

      const updated = await controller.updateControlledData('cd-1', { label: 'Remote Worldwide' });
      expect(updated.message).toContain('updated');

      const deleted = await controller.deleteControlledData('cd-1', 'true');
      expect(deleted.success).toBe(true);

      const seeded = await controller.seedControlledData();
      expect(seeded.seededCount).toBe(20);
    });
  });
});

