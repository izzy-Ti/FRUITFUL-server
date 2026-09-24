import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';

describe('JobsController', () => {
  let controller: JobsController;
  let service: JobsService;

  const mockUser: AuthUser = {
    id: 'user-emp-1',
    email: 'employer@fruitful.com',
    name: 'Tech Inc',
    emailVerified: true,
    role: 'employer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-1',
    title: 'Senior Frontend Engineer',
    description: 'Great role description',
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
    skills: ['React', 'TypeScript'],
    status: 'published',
    publishedAt: new Date().toISOString(),
    closedAt: null,
    deadline: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockJobsService = {
    findPublicJobs: vi.fn(),
    getMyJobs: vi.fn(),
    getJobById: vi.fn(),
    createJob: vi.fn(),
    updateJob: vi.fn(),
    publishJob: vi.fn(),
    closeJob: vi.fn(),
    deleteJob: vi.fn(),
    findAllAdmin: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        { provide: JobsService, useValue: mockJobsService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
    service = module.get<JobsService>(JobsService);
    vi.clearAllMocks();
  });

  describe('findPublicJobs', () => {
    it('should call service and return public jobs', async () => {
      mockJobsService.findPublicJobs.mockResolvedValue({
        total: 1,
        page: 1,
        limit: 20,
        jobs: [mockJob],
      });

      const res = await controller.findPublicJobs({ search: 'React' });
      expect(res.total).toBe(1);
      expect(res.jobs).toEqual([mockJob]);
      expect(mockJobsService.findPublicJobs).toHaveBeenCalledWith({ search: 'React' });
    });
  });

  describe('getJobById', () => {
    it('should return a specific job', async () => {
      mockJobsService.getJobById.mockResolvedValue(mockJob);

      const res = await controller.getJobById('job-1', mockUser);
      expect(res).toEqual(mockJob);
      expect(mockJobsService.getJobById).toHaveBeenCalledWith('job-1', mockUser);
    });
  });

  describe('getMyJobs', () => {
    it('should return logged in employer jobs', async () => {
      mockJobsService.getMyJobs.mockResolvedValue([mockJob]);

      const res = await controller.getMyJobs(mockUser, 'published');
      expect(res.count).toBe(1);
      expect(res.jobs).toEqual([mockJob]);
      expect(mockJobsService.getMyJobs).toHaveBeenCalledWith('user-emp-1', 'published');
    });
  });

  describe('createJob', () => {
    it('should create a job and return success response', async () => {
      mockJobsService.createJob.mockResolvedValue(mockJob);

      const res = await controller.createJob(mockUser, {
        title: 'Senior Frontend Engineer',
        description: 'Great role description',
      });

      expect(res.message).toBe('Job listing created successfully.');
      expect(res.job).toEqual(mockJob);
      expect(mockJobsService.createJob).toHaveBeenCalledWith(
        'user-emp-1',
        expect.objectContaining({ title: 'Senior Frontend Engineer' }),
      );
    });
  });

  describe('updateJob, publishJob, and closeJob', () => {
    it('should update a job', async () => {
      mockJobsService.updateJob.mockResolvedValue({ ...mockJob, title: 'Lead Engineer' });

      const res = await controller.updateJob(mockUser, 'job-1', {
        title: 'Lead Engineer',
      });

      expect(res.message).toBe('Job listing updated successfully.');
      expect(mockJobsService.updateJob).toHaveBeenCalledWith(
        'user-emp-1',
        'job-1',
        { title: 'Lead Engineer' },
        false,
      );
    });

    it('should publish a job', async () => {
      mockJobsService.publishJob.mockResolvedValue(mockJob);

      const res = await controller.publishJob(mockUser, 'job-1');
      expect(res.message).toBe('Job published successfully.');
      expect(mockJobsService.publishJob).toHaveBeenCalledWith('user-emp-1', 'job-1', false);
    });

    it('should close a job', async () => {
      mockJobsService.closeJob.mockResolvedValue({ ...mockJob, status: 'closed' });

      const res = await controller.closeJob(mockUser, 'job-1');
      expect(res.message).toBe('Job closed successfully.');
      expect(mockJobsService.closeJob).toHaveBeenCalledWith('user-emp-1', 'job-1', false);
    });
  });

  describe('deleteJob', () => {
    it('should delete a job', async () => {
      mockJobsService.deleteJob.mockResolvedValue({ message: 'Job deleted successfully.' });

      const res = await controller.deleteJob(mockUser, 'job-1');
      expect(res.message).toBe('Job deleted successfully.');
      expect(mockJobsService.deleteJob).toHaveBeenCalledWith('user-emp-1', 'job-1', false);
    });
  });
});
