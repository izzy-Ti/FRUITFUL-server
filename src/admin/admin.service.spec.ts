import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminService } from './admin.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { EmployersService } from '../employers/employers.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { JobSeekersService } from '../job-seekers/job-seekers.service.js';
import { Role } from '../common/enums/role.enum.js';

describe('AdminService', () => {
  let service: AdminService;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'job_seeker',
    status: 'active',
    suspendedAt: null,
    suspensionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployerProfile = {
    id: 'emp-1',
    userId: 'user-emp-1',
    name: 'Tech Safari Inc',
    verificationStatus: 'pending',
    verifiedAt: null,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-1',
    title: 'Senior Engineer',
    status: 'draft',
    adminNotes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockJobSeekerProfile = {
    id: 'profile-1',
    userId: 'user-1',
    headline: 'Senior Full Stack Engineer',
    approvalStatus: 'pending',
    adminNotes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPortfolioProject = {
    id: 'proj-1',
    profileId: 'profile-1',
    title: 'Flagged Project',
    moderationStatus: 'approved',
    adminNotes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let mockPrismaService: any;
  let mockEmployersService: any;
  let mockJobsService: any;
  let mockJobSeekersService: any;

  beforeEach(async () => {
    const createMockChain = (defaultItem: any) => {
      const chain: any = {};
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.orderBy = vi.fn().mockImplementation(() => chain);
      chain.limit = vi.fn().mockImplementation(() => chain);
      chain.all = vi.fn().mockResolvedValue([defaultItem]);
      chain.first = vi.fn().mockResolvedValue(defaultItem);
      chain.update = vi.fn().mockResolvedValue(defaultItem);
      chain.delete = vi.fn().mockResolvedValue({});
      return chain;
    };

    mockPrismaService = {
      client: {
        orm: {
          public: {
            User: createMockChain(mockUser),
            EmployerProfile: createMockChain(mockEmployerProfile),
            Job: createMockChain(mockJob),
            JobSeekerProfile: createMockChain(mockJobSeekerProfile),
            PortfolioProject: createMockChain(mockPortfolioProject),
          },
        },
      },
    };

    mockEmployersService = {
      findAllAdmin: vi.fn().mockResolvedValue([mockEmployerProfile]),
      getProfileById: vi.fn().mockResolvedValue(mockEmployerProfile),
      getVerificationHistory: vi.fn().mockResolvedValue([{ id: 'ver-1', status: 'pending' }]),
      updateVerificationStatus: vi.fn().mockResolvedValue({ ...mockEmployerProfile, verificationStatus: 'verified' }),
      getMyProfile: vi.fn().mockResolvedValue(mockEmployerProfile),
    };

    mockJobsService = {
      findAllAdmin: vi.fn().mockResolvedValue({ total: 1, jobs: [mockJob] }),
      getJobById: vi.fn().mockResolvedValue(mockJob),
      deleteJob: vi.fn().mockResolvedValue({ message: 'Job deleted' }),
    };

    mockJobSeekersService = {
      searchTalent: vi.fn().mockResolvedValue([mockJobSeekerProfile]),
      getFullProfileByUserId: vi.fn().mockResolvedValue(mockJobSeekerProfile),
      moderateTalentProfile: vi.fn().mockResolvedValue({ ...mockJobSeekerProfile, approvalStatus: 'approved' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmployersService, useValue: mockEmployersService },
        { provide: JobsService, useValue: mockJobsService },
        { provide: JobSeekersService, useValue: mockJobSeekersService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    vi.clearAllMocks();
  });

  describe('User & Account Management', () => {
    it('should list users with pagination and search', async () => {
      const res = await service.listUsers({ search: 'test', page: 1, limit: 10 });
      expect(res.total).toBe(1);
      expect(res.users).toHaveLength(1);
      expect(res.users[0].email).toBe('test@example.com');
    });

    it('should get user by id with linked profile data', async () => {
      const res = await service.getUserById('user-1');
      expect(res.id).toBe('user-1');
      expect(res.email).toBe('test@example.com');
      expect(res.jobSeekerProfile).toBeDefined();
    });

    it('should update user role', async () => {
      const res = await service.updateUserRole('admin-1', 'user-1', { role: Role.ADMIN });
      expect(res.role).toBe(Role.ADMIN);
      expect(res.message).toBe('User role updated to admin.');
    });

    it('should suspend a user account with reason', async () => {
      const res = await service.suspendUser('admin-1', 'user-1', { reason: 'Violation of terms' });
      expect(res.status).toBe('suspended');
      expect(res.suspensionReason).toBe('Violation of terms');
    });

    it('should prevent admin from suspending themselves', async () => {
      await expect(
        service.suspendUser('admin-1', 'admin-1', { reason: 'Self suspension' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reactivate a suspended user account', async () => {
      const res = await service.reactivateUser('admin-1', 'user-1');
      expect(res.status).toBe('active');
    });
  });

  describe('Employer Review & Verification', () => {
    it('should list employers for admin review', async () => {
      const res = await service.listEmployers({ verificationStatus: 'pending' });
      expect(res).toHaveLength(1);
      expect(mockEmployersService.findAllAdmin).toHaveBeenCalledWith({ verificationStatus: 'pending' });
    });

    it('should get employer with verification history', async () => {
      const res = await service.getEmployerById('emp-1');
      expect(res.name).toBe('Tech Safari Inc');
      expect(res.verificationHistory).toHaveLength(1);
    });

    it('should verify employer organization', async () => {
      const res = await service.verifyEmployer('admin-1', 'emp-1', 'verified');
      expect(res.verificationStatus).toBe('verified');
      expect(mockEmployersService.updateVerificationStatus).toHaveBeenCalledWith(
        'emp-1',
        { status: 'verified', rejectionReason: undefined },
        'admin-1',
      );
    });
  });

  describe('Job Approval, Rejection & Removal', () => {
    it('should list jobs for admin', async () => {
      const res = await service.listJobs({ status: 'draft' });
      expect(res.total).toBe(1);
      expect(mockJobsService.findAllAdmin).toHaveBeenCalledWith({ status: 'draft' });
    });

    it('should approve a job listing', async () => {
      mockJobsService.getJobById.mockResolvedValue({ ...mockJob, status: 'published' });

      const res = await service.approveJob('admin-1', 'job-1', { adminNotes: 'Job approved' });
      expect(res.status).toBe('published');
    });

    it('should reject a job listing with reason', async () => {
      mockJobsService.getJobById.mockResolvedValue({ ...mockJob, status: 'closed' });

      const res = await service.rejectJob('admin-1', 'job-1', { reason: 'Misleading salary range' });
      expect(res.status).toBe('closed');
    });

    it('should remove a job listing', async () => {
      const res = await service.removeJob('admin-1', 'job-1');
      expect(res.message).toBe('Job deleted');
      expect(mockJobsService.deleteJob).toHaveBeenCalledWith('admin-1', 'job-1', true);
    });
  });

  describe('Profile & Portfolio Content Moderation', () => {
    it('should list talent profiles for moderation', async () => {
      const res = await service.listTalentProfiles({ approvalStatus: 'pending' });
      expect(res).toHaveLength(1);
      expect(mockJobSeekersService.searchTalent).toHaveBeenCalledWith(
        expect.objectContaining({ approvalStatus: 'pending', viewerRole: Role.ADMIN }),
      );
    });

    it('should moderate talent profile approval status', async () => {
      const res = await service.moderateTalentProfile('admin-1', 'profile-1', {
        approvalStatus: 'approved' as any,
        adminNotes: 'Verified portfolio',
      });
      expect(res.approvalStatus).toBe('approved');
    });

    it('should list portfolio projects with moderation status', async () => {
      const res = await service.listPortfolioProjects({ moderationStatus: 'approved' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('proj-1');
    });

    it('should moderate a portfolio project', async () => {
      const res = await service.moderatePortfolioProject('admin-1', 'proj-1', {
        status: 'flagged',
        adminNotes: 'Review copyright',
      });
      expect(res.moderationStatus).toBe('flagged');
      expect(res.adminNotes).toBe('Review copyright');
    });

    it('should remove an inappropriate portfolio project', async () => {
      const res = await service.removePortfolioProject('admin-1', 'proj-1');
      expect(res.success).toBe(true);
      expect(res.message).toContain('permanently removed');
    });
  });

  describe('Operational Dashboard Stats', () => {
    it('should aggregate metrics across users, employers, jobs, profiles and portfolio', async () => {
      const stats = await service.getDashboardStats();
      expect(stats.users.total).toBe(1);
      expect(stats.employers.total).toBe(1);
      expect(stats.jobs.total).toBe(1);
      expect(stats.talentProfiles.total).toBe(1);
      expect(stats.portfolio.total).toBe(1);
    });
  });
});
