import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationsService } from './applications.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('ApplicationsService', () => {
  let service: ApplicationsService;

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-seeker-1',
    headline: 'Full Stack Engineer',
    cvUrl: 'https://example.com/cv.pdf',
    languages: ['English'],
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-1',
    title: 'Senior Frontend Engineer',
    category: 'Engineering',
    employmentType: 'full_time',
    workplaceType: 'remote',
    location: 'Remote',
    salaryMin: 50000,
    salaryMax: 80000,
    salaryCurrency: 'USD',
    status: 'published',
    deadline: null,
  };

  const mockEmployer = {
    id: 'emp-1',
    userId: 'user-emp-1',
    name: 'Tech Corp',
    logoUrl: 'https://example.com/logo.png',
    location: 'Nairobi',
    verificationStatus: 'verified',
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'profile-1',
    status: 'submitted',
    coverLetter: 'I would love to join your team.',
    cvUrl: 'https://example.com/cv.pdf',
    portfolioLinks: ['https://github.com/mywork'],
    employerNotes: null,
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          JobSeekerProfile: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockProfile),
            }),
          },
          Job: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockJob),
            }),
          },
          EmployerProfile: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(mockEmployer),
            }),
          },
          JobApplication: {
            where: vi.fn(),
            create: vi.fn(),
          },
          User: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'user-seeker-1', name: 'Jane Doe', email: 'jane@example.com' }),
            }),
          },
          EducationRecord: {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
              }),
            }),
          },
          ExperienceRecord: {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
              }),
            }),
          },
          ProfileSkill: {
            where: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue([]),
            }),
          },
          PortfolioProject: {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
              }),
            }),
          },
          Skill: {
            where: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'skill-1', name: 'React', category: 'Frontend' }),
            }),
          },
        },
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    vi.clearAllMocks();
  });

  describe('applyToJob', () => {
    it('should throw BadRequestException if user has no profile', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.applyToJob('user-1', { jobId: 'job-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if job does not exist', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.applyToJob('user-seeker-1', { jobId: 'job-unknown' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if job is not published', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockJob, status: 'draft' }),
      });

      await expect(
        service.applyToJob('user-seeker-1', { jobId: 'job-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if candidate already applied', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockApplication),
      });

      await expect(
        service.applyToJob('user-seeker-1', { jobId: 'job-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should apply to job successfully', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.JobApplication.create.mockResolvedValue(mockApplication);
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployer),
      });

      const res = await service.applyToJob('user-seeker-1', {
        jobId: 'job-1',
        coverLetter: 'I would love to join your team.',
      });

      expect(res.jobId).toBe('job-1');
      expect(res.status).toBe('submitted');
      expect(mockPrismaService.client.orm.public.JobApplication.create).toHaveBeenCalled();
    });
  });

  describe('withdrawApplication', () => {
    it('should throw NotFoundException if application not found', async () => {
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.withdrawApplication('user-seeker-1', 'app-unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the applicant', async () => {
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockApplication),
      });
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'profile-other', userId: 'user-other' }),
      });

      await expect(
        service.withdrawApplication('user-other', 'app-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should withdraw application successfully', async () => {
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockApplication),
        update: vi.fn().mockResolvedValue({ ...mockApplication, status: 'withdrawn' }),
      });
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployer),
      });

      const res = await service.withdrawApplication('user-seeker-1', 'app-1');
      expect(res.message).toBe('Application withdrawn successfully.');
    });
  });

  describe('getApplicantsForJob and updateApplicationStatus', () => {
    it('should throw ForbiddenException if employer does not own the job', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'emp-other', userId: 'user-other' }),
      });

      await expect(
        service.getApplicantsForJob('user-other', 'job-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update application status', async () => {
      mockPrismaService.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockApplication),
        update: vi.fn().mockResolvedValue({}),
      });
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployer),
      });

      const res = await service.updateApplicationStatus('user-emp-1', 'app-1', {
        status: 'shortlisted',
        employerNotes: 'Strong frontend experience',
      });

      expect(res).toBeDefined();
    });
  });
});
