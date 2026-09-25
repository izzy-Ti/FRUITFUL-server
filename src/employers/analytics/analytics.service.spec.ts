import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockPrisma: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'recruiter@techcorp.com',
    name: 'TechCorp Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser: AuthUser = {
    id: 'user-admin-1',
    email: 'admin@fruitful.com',
    name: 'Fruitful Admin',
    role: Role.ADMIN,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'TechCorp Global',
  };

  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  const mockJobs = [
    {
      id: 'job-1',
      employerId: 'emp-profile-1',
      title: 'Senior Fullstack Engineer',
      category: 'Software Engineering',
      status: 'published',
      publishedAt: daysAgo(40),
      createdAt: daysAgo(45),
    },
    {
      id: 'job-2',
      employerId: 'emp-profile-1',
      title: 'Data Platform Architect',
      category: 'Data & AI',
      status: 'published',
      publishedAt: daysAgo(15),
      createdAt: daysAgo(20),
    },
    {
      id: 'job-other',
      employerId: 'other-emp',
      title: 'Other Company Job',
      category: 'Marketing',
      status: 'published',
      publishedAt: daysAgo(10),
      createdAt: daysAgo(10),
    },
  ];

  const mockStages = [
    { id: 'stg-1', employerId: 'emp-profile-1', name: 'Applied', stageType: 'applied', order: 0, color: '#3b82f6' },
    { id: 'stg-2', employerId: 'emp-profile-1', name: 'Screening', stageType: 'screening', order: 1, color: '#06b6d4' },
    { id: 'stg-3', employerId: 'emp-profile-1', name: 'Interview', stageType: 'interview', order: 2, color: '#8b5cf6' },
    { id: 'stg-4', employerId: 'emp-profile-1', name: 'Offer', stageType: 'offer', order: 3, color: '#ec4899' },
    { id: 'stg-5', employerId: 'emp-profile-1', name: 'Hired', stageType: 'hired', order: 4, color: '#10b981' },
  ];

  const mockApplications = [
    {
      id: 'app-1',
      jobId: 'job-1',
      profileId: 'cand-1',
      status: 'hired',
      stageId: 'stg-5',
      appliedAt: daysAgo(25),
      stageMovedAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
    {
      id: 'app-2',
      jobId: 'job-1',
      profileId: 'cand-2',
      status: 'interview',
      stageId: 'stg-3',
      appliedAt: daysAgo(18),
      stageMovedAt: daysAgo(10),
      updatedAt: daysAgo(10),
    },
    {
      id: 'app-3',
      jobId: 'job-1',
      profileId: 'cand-3',
      status: 'rejected',
      stageId: 'stg-2',
      rejectionReasonCode: 'skills_mismatch',
      rejectionCategory: 'skills',
      appliedAt: daysAgo(20),
      stageMovedAt: daysAgo(12),
      rejectedAt: daysAgo(12),
      updatedAt: daysAgo(12),
    },
    {
      id: 'app-4',
      jobId: 'job-2',
      profileId: 'cand-4',
      status: 'submitted',
      stageId: 'stg-1',
      appliedAt: daysAgo(5),
      stageMovedAt: daysAgo(5),
      updatedAt: daysAgo(5),
    },
  ];

  const mockInterviews = [
    {
      id: 'int-1',
      jobId: 'job-1',
      applicationId: 'app-1',
      employerId: 'emp-profile-1',
      candidateId: 'cand-1',
      status: 'completed',
      interviewType: 'video',
      rating: 5,
      startTime: daysAgo(12),
    },
    {
      id: 'int-2',
      jobId: 'job-1',
      applicationId: 'app-2',
      employerId: 'emp-profile-1',
      candidateId: 'cand-2',
      status: 'scheduled',
      interviewType: 'video',
      rating: null,
      startTime: daysAgo(1),
    },
  ];

  const mockOffers = [
    {
      id: 'off-1',
      jobId: 'job-1',
      applicationId: 'app-1',
      employerId: 'emp-profile-1',
      candidateId: 'cand-1',
      status: 'accepted',
      salary: 130000,
      currency: 'USD',
      createdAt: daysAgo(8),
    },
  ];

  const mockHistory = [
    {
      id: 'hist-1',
      applicationId: 'app-1',
      previousStatus: 'offered',
      newStatus: 'hired',
      createdAt: daysAgo(5),
    },
  ];

  const mockSavedCandidates = [
    {
      id: 'sc-1',
      employerId: 'emp-profile-1',
      profileId: 'cand-1',
      createdAt: daysAgo(30),
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => mockEmployer),
              }),
              all: vi.fn().mockResolvedValue([mockEmployer]),
            },
            Job: {
              where: vi.fn().mockImplementation((filter) => ({
                all: vi.fn().mockImplementation(async () =>
                  mockJobs.filter((j) => !filter.employerId || j.employerId === filter.employerId),
                ),
              })),
            },
            JobApplication: {
              all: vi.fn().mockResolvedValue(mockApplications),
            },
            JobInterview: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockInterviews),
              }),
            },
            JobOffer: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockOffers),
              }),
            },
            PipelineStage: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockStages),
              }),
            },
            ApplicationStatusHistory: {
              all: vi.fn().mockResolvedValue(mockHistory),
            },
            SavedCandidate: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue(mockSavedCandidates),
              }),
            },
          },
        },
      },
    };

    service = new AnalyticsService(mockPrisma as any);
  });

  describe('getOverviewAnalytics', () => {
    it('should calculate accurate executive KPIs and rates', async () => {
      const res = await service.getOverviewAnalytics(employerUser, { timeframe: '30d' });

      expect(res.kpis.totalApplications).toBe(4);
      expect(res.kpis.activeCandidates).toBe(2); // app-2 (interview), app-4 (submitted)
      expect(res.kpis.totalHired).toBe(1);
      expect(res.kpis.totalRejected).toBe(1);
      expect(res.kpis.interviewsScheduled).toBe(2);
      expect(res.kpis.interviewsCompleted).toBe(1);
      expect(res.kpis.offersExtended).toBe(1);
      expect(res.kpis.offersAccepted).toBe(1);
      expect(res.kpis.overallHireRatePercent).toBe(25); // 1 / 4 = 25%
      expect(res.kpis.offerAcceptanceRatePercent).toBe(100);
      expect(res.kpis.avgTimeToHireDays).toBe(20); // 25 days - 5 days = 20 days
      expect(res.kpis.avgTimeToFillDays).toBe(35); // 40 days - 5 days = 35 days
    });

    it('should generate pipeline stage conversion funnel with bottleneck identification', async () => {
      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.funnel.stages.length).toBe(5);
      expect(res.funnel.overallConversionRate).toBe(25);
      expect(res.funnel.stages[0].stageName).toBe('Applied');
      expect(res.funnel.stages[0].candidateCount).toBe(4);
      expect(res.funnel.stages[4].stageName).toBe('Hired');
      expect(res.funnel.stages[4].candidateCount).toBe(1);
    });

    it('should generate timeline trends data points', async () => {
      const res = await service.getOverviewAnalytics(employerUser, { timeframe: '7d' });

      expect(res.timeline.length).toBeGreaterThan(0);
      expect(res.timeline[0]).toHaveProperty('period');
      expect(res.timeline[0]).toHaveProperty('applications');
      expect(res.timeline[0]).toHaveProperty('interviews');
      expect(res.timeline[0]).toHaveProperty('offers');
      expect(res.timeline[0]).toHaveProperty('hires');
    });

    it('should compute candidate sourcing channel breakdown', async () => {
      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.candidateSources.length).toBe(2);
      const sourced = res.candidateSources.find((s) => s.channel.includes('Talent Pool'));
      expect(sourced?.applicantCount).toBe(1); // cand-1 was in savedCandidates
      expect(sourced?.hiresCount).toBe(1);
      expect(sourced?.hireConversionRatePercent).toBe(100);
    });

    it('should aggregate top rejection reasons', async () => {
      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.topRejectionReasons.length).toBe(1);
      expect(res.topRejectionReasons[0].reasonCode).toBe('skills_mismatch');
      expect(res.topRejectionReasons[0].count).toBe(1);
      expect(res.topRejectionReasons[0].percentage).toBe(100);
    });

    it('should provide job performance table with health scoring', async () => {
      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.jobPerformance.length).toBe(2);
      const job1 = res.jobPerformance.find((j) => j.jobId === 'job-1');
      expect(job1?.applicantsCount).toBe(3);
      expect(job1?.hiredCount).toBe(1);
      expect(job1?.conversionRatePercent).toBe(33.3);
      expect(job1?.avgTimeToHireDays).toBe(20);
    });

    it('should compute interview metrics breakdown and rating distribution', async () => {
      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.interviewAnalytics.totalInterviews).toBe(2);
      expect(res.interviewAnalytics.completed).toBe(1);
      expect(res.interviewAnalytics.averageRating).toBe(5);
      expect(res.interviewAnalytics.ratingDistribution[5]).toBe(1);
      expect(res.interviewAnalytics.typeBreakdown['video']).toBe(2);
    });

    it('should filter by specific jobId', async () => {
      const res = await service.getOverviewAnalytics(employerUser, { jobId: 'job-1' });

      expect(res.jobPerformance.length).toBe(1);
      expect(res.jobPerformance[0].jobId).toBe('job-1');
      expect(res.kpis.totalApplications).toBe(3);
    });

    it('should throw ForbiddenException if job does not belong to employer', async () => {
      await expect(
        service.getOverviewAnalytics(employerUser, { jobId: 'job-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if employer profile does not exist', async () => {
      mockPrisma.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.getOverviewAnalytics({ ...employerUser, id: 'unknown-user' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTimeToHireAnalytics', () => {
    it('should return deep-dive speed and velocity metrics', async () => {
      const res = await service.getTimeToHireAnalytics(employerUser);

      expect(res.avgTimeToHireDays).toBe(20);
      expect(res.avgTimeToFillDays).toBe(35);
      expect(res.timeToHireStats.totalHires).toBe(1);
      expect(res.timeToHireStats.medianDays).toBe(20);
      expect(res.jobBreakdown.length).toBe(2);
    });
  });

  describe('getPipelineFunnelAnalytics', () => {
    it('should return pipeline conversion and stage metrics', async () => {
      const res = await service.getPipelineFunnelAnalytics(employerUser);

      expect(res.totalApplications).toBe(4);
      expect(res.totalHired).toBe(1);
      expect(res.overallConversionRate).toBe(25);
      expect(res.stages.length).toBe(5);
    });
  });

  describe('getJobBenchmarkAnalytics', () => {
    it('should return comparative benchmarks with summary counts', async () => {
      const res = await service.getJobBenchmarkAnalytics(employerUser, { sortBy: 'applicants', sortOrder: 'desc' });

      expect(res.summary.totalJobs).toBe(2);
      expect(res.summary.activeJobs).toBe(2);
      expect(res.jobs[0].jobId).toBe('job-1'); // 3 applicants vs 1 applicant
    });

    it('should allow sorting by title or conversion rate', async () => {
      const res = await service.getJobBenchmarkAnalytics(employerUser, { sortBy: 'title', sortOrder: 'asc' });

      expect(res.jobs[0].title).toBe('Data Platform Architect');
    });
  });

  describe('getInterviewAnalytics', () => {
    it('should return detailed interview stats and ratings', async () => {
      const res = await service.getInterviewAnalytics(employerUser);

      expect(res.metrics.totalInterviews).toBe(2);
      expect(res.metrics.completionRatePercent).toBe(100);
      expect(res.metrics.averageRating).toBe(5);
    });
  });

  describe('exportAnalyticsReport', () => {
    it('should generate formatted CSV text containing executive and job sections', async () => {
      const csv = await service.exportAnalyticsReport(employerUser, { format: 'csv' });

      expect(typeof csv).toBe('string');
      expect(csv).toContain('FRUITFUL JOURNEY - HIRING ANALYTICS REPORT');
      expect(csv).toContain('EXECUTIVE METRICS');
      expect(csv).toContain('Total Applications,4');
      expect(csv).toContain('RECRUITMENT FUNNEL CONVERSION');
      expect(csv).toContain('JOB PERFORMANCE BENCHMARKS');
      expect(csv).toContain('Senior Fullstack Engineer');
    });

    it('should return JSON report when requested', async () => {
      const json = await service.exportAnalyticsReport(employerUser, { format: 'json' });

      expect(json).toHaveProperty('report');
      expect((json as any).report.kpis.totalApplications).toBe(4);
    });
  });

  describe('Edge cases and empty state', () => {
    it('should handle zero applications and jobs gracefully without division by zero errors', async () => {
      mockPrisma.client.orm.public.JobApplication.all.mockResolvedValue([]);
      mockPrisma.client.orm.public.JobInterview.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });
      mockPrisma.client.orm.public.Job.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });

      const res = await service.getOverviewAnalytics(employerUser);

      expect(res.kpis.totalApplications).toBe(0);
      expect(res.kpis.totalHired).toBe(0);
      expect(res.kpis.overallHireRatePercent).toBe(0);
      expect(res.kpis.avgTimeToHireDays).toBeNull();
      expect(res.kpis.avgTimeToFillDays).toBeNull();
      expect(res.funnel.overallConversionRate).toBe(0);
      expect(res.jobPerformance.length).toBe(0);
    });

    it('should allow Admin users to view employer analytics', async () => {
      const res = await service.getOverviewAnalytics(adminUser);
      expect(res.kpis.totalApplications).toBe(4);
    });
  });
});
