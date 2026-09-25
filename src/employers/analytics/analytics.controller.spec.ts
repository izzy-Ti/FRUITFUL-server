import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsController } from './analytics.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockService: any;
  let mockRes: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'recruiter@techcorp.com',
    name: 'TechCorp Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      getOverviewAnalytics: vi.fn().mockResolvedValue({
        timeframe: '30d',
        kpis: { totalApplications: 10, totalHired: 2 },
      }),
      getTimeToHireAnalytics: vi.fn().mockResolvedValue({
        avgTimeToHireDays: 18,
        timeToHireStats: { medianDays: 17 },
      }),
      getPipelineFunnelAnalytics: vi.fn().mockResolvedValue({
        totalApplications: 10,
        stages: [],
      }),
      getJobBenchmarkAnalytics: vi.fn().mockResolvedValue({
        summary: { totalJobs: 5 },
        jobs: [],
      }),
      getInterviewAnalytics: vi.fn().mockResolvedValue({
        metrics: { totalInterviews: 8 },
      }),
      exportAnalyticsReport: vi.fn().mockResolvedValue('CSV,CONTENT,HERE'),
    };

    mockRes = {
      setHeader: vi.fn(),
      send: vi.fn().mockImplementation((val) => val),
      json: vi.fn().mockImplementation((val) => val),
    };

    controller = new AnalyticsController(mockService);
  });

  describe('getOverviewAnalytics', () => {
    it('should delegate to analyticsService.getOverviewAnalytics', async () => {
      const query = { timeframe: '30d' as const };
      const res = await controller.getOverviewAnalytics(mockUser, query);

      expect(mockService.getOverviewAnalytics).toHaveBeenCalledWith(mockUser, query);
      expect(res.kpis.totalApplications).toBe(10);
    });
  });

  describe('getTimeToHire', () => {
    it('should delegate to analyticsService.getTimeToHireAnalytics', async () => {
      const query = { jobId: 'job-1' };
      const res = await controller.getTimeToHire(mockUser, query);

      expect(mockService.getTimeToHireAnalytics).toHaveBeenCalledWith(mockUser, query);
      expect(res.avgTimeToHireDays).toBe(18);
    });
  });

  describe('getPipelineFunnel', () => {
    it('should delegate to analyticsService.getPipelineFunnelAnalytics', async () => {
      const res = await controller.getPipelineFunnel(mockUser, {});

      expect(mockService.getPipelineFunnelAnalytics).toHaveBeenCalledWith(mockUser, {});
      expect(res.totalApplications).toBe(10);
    });
  });

  describe('getJobBenchmarks', () => {
    it('should delegate to analyticsService.getJobBenchmarkAnalytics', async () => {
      const query = { sortBy: 'applicants' as const };
      const res = await controller.getJobBenchmarks(mockUser, query);

      expect(mockService.getJobBenchmarkAnalytics).toHaveBeenCalledWith(mockUser, query);
      expect(res.summary.totalJobs).toBe(5);
    });
  });

  describe('getInterviewAnalytics', () => {
    it('should delegate to analyticsService.getInterviewAnalytics', async () => {
      const res = await controller.getInterviewAnalytics(mockUser, {});

      expect(mockService.getInterviewAnalytics).toHaveBeenCalledWith(mockUser, {});
      expect(res.metrics.totalInterviews).toBe(8);
    });
  });

  describe('exportAnalytics', () => {
    it('should export CSV with headers and file attachment disposition', async () => {
      await controller.exportAnalytics(mockUser, { format: 'csv' }, mockRes);

      expect(mockService.exportAnalyticsReport).toHaveBeenCalledWith(mockUser, { format: 'csv' });
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename="fruitful-hiring-analytics-'),
      );
      expect(mockRes.send).toHaveBeenCalledWith('CSV,CONTENT,HERE');
    });

    it('should return JSON when format is json', async () => {
      mockService.exportAnalyticsReport.mockResolvedValue({ report: { kpis: {} } });

      await controller.exportAnalytics(mockUser, { format: 'json' }, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ report: { kpis: {} } });
    });
  });
});
