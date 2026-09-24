import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  let service: ApplicationsService;

  const mockCandidateUser: AuthUser = {
    id: 'user-seeker-1',
    email: 'candidate@example.com',
    name: 'Jane Doe',
    emailVerified: true,
    role: 'job_seeker',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'employer@fruitful.com',
    name: 'Tech Corp',
    emailVerified: true,
    role: 'employer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'profile-1',
    status: 'submitted',
    coverLetter: 'Cover letter content',
    cvUrl: 'https://example.com/cv.pdf',
    portfolioLinks: [],
    employerNotes: null,
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockApplicationsService = {
    applyToJob: vi.fn(),
    withdrawApplication: vi.fn(),
    getMyApplications: vi.fn(),
    getApplicantsForJob: vi.fn(),
    updateApplicationStatus: vi.fn(),
    getApplicationById: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        { provide: ApplicationsService, useValue: mockApplicationsService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
    service = module.get<ApplicationsService>(ApplicationsService);
    vi.clearAllMocks();
  });

  describe('applyToJob', () => {
    it('should submit application successfully', async () => {
      mockApplicationsService.applyToJob.mockResolvedValue(mockApplication);

      const res = await controller.applyToJob(mockCandidateUser, {
        jobId: 'job-1',
        coverLetter: 'Cover letter content',
      });

      expect(res.message).toBe('Application submitted successfully.');
      expect(res.application).toEqual(mockApplication);
      expect(mockApplicationsService.applyToJob).toHaveBeenCalledWith(
        'user-seeker-1',
        expect.objectContaining({ jobId: 'job-1' }),
      );
    });
  });

  describe('withdrawApplication', () => {
    it('should withdraw application', async () => {
      mockApplicationsService.withdrawApplication.mockResolvedValue({
        message: 'Application withdrawn successfully.',
        application: { ...mockApplication, status: 'withdrawn' },
      });

      const res = await controller.withdrawApplication(mockCandidateUser, 'app-1');
      expect(res.message).toBe('Application withdrawn successfully.');
      expect(mockApplicationsService.withdrawApplication).toHaveBeenCalledWith('user-seeker-1', 'app-1');
    });
  });

  describe('getMyApplications', () => {
    it('should return candidate applications', async () => {
      mockApplicationsService.getMyApplications.mockResolvedValue([mockApplication]);

      const res = await controller.getMyApplications(mockCandidateUser, 'submitted');
      expect(res.count).toBe(1);
      expect(res.applications).toEqual([mockApplication]);
      expect(mockApplicationsService.getMyApplications).toHaveBeenCalledWith('user-seeker-1', 'submitted');
    });
  });

  describe('getApplicantsForJob (Employer)', () => {
    it('should return applicants for a job', async () => {
      mockApplicationsService.getApplicantsForJob.mockResolvedValue({
        count: 1,
        jobTitle: 'Senior Frontend Engineer',
        applications: [mockApplication],
      });

      const res = await controller.getApplicantsForJob(mockEmployerUser, 'job-1', {});
      expect(res.count).toBe(1);
      expect(res.jobTitle).toBe('Senior Frontend Engineer');
      expect(res.applications).toEqual([mockApplication]);
    });
  });

  describe('updateApplicationStatus (Employer)', () => {
    it('should update applicant status', async () => {
      mockApplicationsService.updateApplicationStatus.mockResolvedValue({
        ...mockApplication,
        status: 'shortlisted',
      });

      const res = await controller.updateApplicationStatus(mockEmployerUser, 'app-1', {
        status: 'shortlisted',
        employerNotes: 'Looking forward to interview',
      });

      expect(res.message).toBe('Application status updated to "shortlisted".');
      expect(mockApplicationsService.updateApplicationStatus).toHaveBeenCalledWith(
        'user-emp-1',
        'app-1',
        expect.objectContaining({ status: 'shortlisted' }),
        false,
      );
    });
  });
});
