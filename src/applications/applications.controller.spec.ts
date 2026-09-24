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
    shortlistCandidate: vi.fn(),
    bulkShortlistCandidates: vi.fn(),
    getApplicationHistory: vi.fn(),
    getCandidateDashboard: vi.fn(),
    getEmployerDashboard: vi.fn(),
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

  describe('getCandidateDashboard', () => {
    it('should return candidate dashboard data', async () => {
      const mockDashboard = {
        metrics: { totalApplied: 1, activeApplications: 1, shortlisted: 0 },
        recentApplications: [mockApplication],
        recentActivities: [],
      };
      mockApplicationsService.getCandidateDashboard.mockResolvedValue(mockDashboard);

      const res = await controller.getCandidateDashboard(mockCandidateUser);
      expect(res).toEqual(mockDashboard);
      expect(mockApplicationsService.getCandidateDashboard).toHaveBeenCalledWith('user-seeker-1');
    });
  });

  describe('getEmployerDashboard', () => {
    it('should return employer dashboard data', async () => {
      const mockDashboard = {
        metrics: { totalJobs: 2, totalApplicants: 5, shortlisted: 2 },
        jobBreakdown: [],
        recentApplicants: [],
      };
      mockApplicationsService.getEmployerDashboard.mockResolvedValue(mockDashboard);

      const res = await controller.getEmployerDashboard(mockEmployerUser);
      expect(res).toEqual(mockDashboard);
      expect(mockApplicationsService.getEmployerDashboard).toHaveBeenCalledWith('user-emp-1', false);
    });
  });

  describe('shortlistCandidate (Employer)', () => {
    it('should shortlist candidate with feedback notes', async () => {
      mockApplicationsService.shortlistCandidate.mockResolvedValue({
        ...mockApplication,
        status: 'shortlisted',
        employerNotes: 'Impressive portfolio',
      });

      const res = await controller.shortlistCandidate(mockEmployerUser, 'app-1', {
        notes: 'Impressive portfolio',
      });

      expect(res.message).toBe('Candidate shortlisted successfully.');
      expect(res.application.status).toBe('shortlisted');
      expect(mockApplicationsService.shortlistCandidate).toHaveBeenCalledWith(
        'user-emp-1',
        'app-1',
        'Impressive portfolio',
        false,
      );
    });
  });

  describe('bulkShortlistCandidates (Employer)', () => {
    it('should bulk shortlist multiple candidates', async () => {
      mockApplicationsService.bulkShortlistCandidates.mockResolvedValue({
        shortlistedCount: 2,
        applications: [mockApplication, mockApplication],
      });

      const res = await controller.bulkShortlistCandidates(mockEmployerUser, {
        applicationIds: ['app-1', 'app-2'],
        notes: 'Batch shortlisted for round 1',
      });

      expect(res.shortlistedCount).toBe(2);
      expect(mockApplicationsService.bulkShortlistCandidates).toHaveBeenCalledWith(
        'user-emp-1',
        ['app-1', 'app-2'],
        'Batch shortlisted for round 1',
        false,
      );
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

  describe('getApplicationHistory', () => {
    it('should return status history timeline', async () => {
      const mockHistory = [
        {
          id: 'hist-1',
          applicationId: 'app-1',
          previousStatus: null,
          newStatus: 'submitted',
          createdAt: new Date().toISOString(),
        },
      ];
      mockApplicationsService.getApplicationHistory.mockResolvedValue(mockHistory);

      const res = await controller.getApplicationHistory(mockCandidateUser, 'app-1');
      expect(res).toEqual(mockHistory);
      expect(mockApplicationsService.getApplicationHistory).toHaveBeenCalledWith(
        'user-seeker-1',
        'app-1',
        'job_seeker',
      );
    });
  });

  describe('getApplicationById', () => {
    it('should return single application details', async () => {
      mockApplicationsService.getApplicationById.mockResolvedValue(mockApplication);

      const res = await controller.getApplicationById(mockCandidateUser, 'app-1');
      expect(res).toEqual(mockApplication);
      expect(mockApplicationsService.getApplicationById).toHaveBeenCalledWith(
        'user-seeker-1',
        'app-1',
        'job_seeker',
      );
    });
  });
});
