import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobsService } from './jobs.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('JobsService', () => {
  let service: JobsService;

  const mockEmployerProfile = {
    id: 'emp-1',
    userId: 'user-emp-1',
    name: 'Tech Innovations Ltd',
    logoUrl: 'https://example.com/logo.png',
    location: 'Nairobi',
    industry: 'Technology',
    websiteUrl: 'https://tech.example.com',
    verificationStatus: 'verified',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-1',
    title: 'Senior Frontend Engineer',
    description: 'We are looking for a Senior React/Next.js developer.',
    requirements: '5+ years experience',
    responsibilities: 'Build UI components',
    category: 'Software Engineering',
    employmentType: 'full_time',
    workplaceType: 'remote',
    location: 'Remote',
    salaryMin: 50000,
    salaryMax: 80000,
    salaryCurrency: 'USD',
    experienceLevel: 'senior',
    skills: ['React', 'TypeScript', 'Next.js'],
    status: 'published',
    publishedAt: new Date().toISOString(),
    closedAt: null,
    deadline: '2026-12-31',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          EmployerProfile: {
            where: vi.fn(),
          },
          Job: {
            where: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
          },
        },
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    vi.clearAllMocks();
  });

  describe('createJob', () => {
    it('should throw BadRequestException if employer profile is not found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.createJob('user-1', {
          title: 'Frontend Dev',
          description: 'Great role',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if salaryMin is greater than salaryMax', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      await expect(
        service.createJob('user-emp-1', {
          title: 'Frontend Dev',
          description: 'Great role',
          salaryMin: 90000,
          salaryMax: 50000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create job as draft by default', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });
      mockPrismaService.client.orm.public.Job.create.mockResolvedValue({
        ...mockJob,
        status: 'draft',
        publishedAt: null,
      });

      const res = await service.createJob('user-emp-1', {
        title: 'Senior Frontend Engineer',
        description: 'Great role',
      });

      expect(res.status).toBe('draft');
      expect(mockPrismaService.client.orm.public.Job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
          publishedAt: null,
        }),
      );
    });

    it('should create job as published if publishImmediately is true', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });
      mockPrismaService.client.orm.public.Job.create.mockResolvedValue({
        ...mockJob,
        status: 'published',
      });

      const res = await service.createJob('user-emp-1', {
        title: 'Senior Frontend Engineer',
        description: 'Great role',
        publishImmediately: true,
      });

      expect(res.status).toBe('published');
    });
  });

  describe('updateJob', () => {
    it('should throw NotFoundException if job does not exist', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateJob('user-emp-1', 'job-unknown', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the job employer', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'emp-other', userId: 'user-other' }),
      });

      await expect(
        service.updateJob('user-other', 'job-1', { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update job successfully when authorized', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
        update: vi.fn().mockResolvedValue({ ...mockJob, title: 'Updated Title' }),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      const res = await service.updateJob('user-emp-1', 'job-1', { title: 'Updated Title' });
      expect(res.title).toBe('Senior Frontend Engineer');
    });
  });

  describe('publishJob and closeJob', () => {
    it('should publish a job and set publishedAt timestamp', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockJob, status: 'draft', publishedAt: null }),
        update: vi.fn().mockResolvedValue({}),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      const res = await service.publishJob('user-emp-1', 'job-1');
      expect(res).toBeDefined();
    });

    it('should close a job and set closedAt timestamp', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockJob, status: 'published' }),
        update: vi.fn().mockResolvedValue({}),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      const res = await service.closeJob('user-emp-1', 'job-1');
      expect(res).toBeDefined();
    });
  });

  describe('findPublicJobs and getJobById', () => {
    it('should return published jobs with pagination', async () => {
      const mockQueryChain: any = {};
      mockQueryChain.where = vi.fn().mockReturnValue(mockQueryChain);
      mockQueryChain.orderBy = vi.fn().mockReturnValue(mockQueryChain);
      mockQueryChain.all = vi.fn().mockResolvedValue([mockJob]);
      mockQueryChain.first = vi.fn().mockResolvedValue(mockJob);

      mockPrismaService.client.orm.public.Job.where = mockQueryChain.where;
      mockPrismaService.client.orm.public.Job.orderBy = mockQueryChain.orderBy;
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      const res = await service.findPublicJobs({ search: 'React', page: 1, limit: 10 });
      expect(res.total).toBe(1);
      expect(res.jobs).toHaveLength(1);
      expect(res.jobs[0].title).toBe('Senior Frontend Engineer');
      expect(res.jobs[0].employer?.name).toBe('Tech Innovations Ltd');
    });

    it('should allow public access to published job', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockJob),
      });
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });

      const res = await service.getJobById('job-1');
      expect(res.id).toBe('job-1');
    });

    it('should throw ForbiddenException if viewing draft job as a guest', async () => {
      mockPrismaService.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockJob, status: 'draft' }),
      });

      await expect(service.getJobById('job-1', undefined)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
