import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import {
  QueryAnalyticsDto,
  ExportAnalyticsDto,
  QueryJobBenchmarkDto,
  AnalyticsTimeframe,
} from './dto/index.js';

export interface AnalyticsKpis {
  totalApplications: number;
  activeCandidates: number;
  shortlistedCount: number;
  interviewsScheduled: number;
  interviewsCompleted: number;
  offersExtended: number;
  offersAccepted: number;
  totalHired: number;
  totalRejected: number;
  overallHireRatePercent: number;
  offerAcceptanceRatePercent: number;
  avgTimeToHireDays: number | null;
  avgTimeToFillDays: number | null;
}

export interface FunnelStageMetric {
  stageId: string;
  stageName: string;
  stageType: string;
  order: number;
  color: string;
  candidateCount: number;
  conversionRatePercent: number;
  dropoffCount: number;
  avgDaysInStage: number;
}

export interface TimelineDataPoint {
  period: string;
  label: string;
  applications: number;
  interviews: number;
  offers: number;
  hires: number;
}

export interface JobPerformanceItem {
  jobId: string;
  title: string;
  category: string;
  status: string;
  publishedAt: string | null;
  daysOpen: number;
  applicantsCount: number;
  screenedCount: number;
  interviewedCount: number;
  offeredCount: number;
  hiredCount: number;
  rejectedCount: number;
  conversionRatePercent: number;
  avgTimeToHireDays: number | null;
  healthStatus: 'healthy' | 'at_risk' | 'needs_attention';
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve employer profile from AuthUser.
   */
  private async getEmployerProfile(user: AuthUser) {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!profile) {
      if (user.role === Role.ADMIN) {
        const firstEmployer = await this.prisma.client.orm.public.EmployerProfile.all();
        if (firstEmployer.length > 0) return firstEmployer[0];
      }
      throw new NotFoundException('Employer profile not found for this account.');
    }
    return profile;
  }

  /**
   * Resolve start and end Date bounds from timeframe or custom dates.
   */
  private resolveDateRange(query?: QueryAnalyticsDto): { start: Date; end: Date } {
    const end = query?.endDate ? new Date(query.endDate) : new Date();
    let start: Date;

    if (query?.startDate) {
      start = new Date(query.startDate);
    } else {
      const timeframe: AnalyticsTimeframe = query?.timeframe || '30d';
      start = new Date(end.getTime());

      switch (timeframe) {
        case '7d':
          start.setDate(end.getDate() - 7);
          break;
        case '30d':
          start.setDate(end.getDate() - 30);
          break;
        case '90d':
          start.setDate(end.getDate() - 90);
          break;
        case '1y':
          start.setFullYear(end.getFullYear() - 1);
          break;
        case 'all':
        case 'custom':
          start = new Date(0); // Beginning of epoch
          break;
        default:
          start.setDate(end.getDate() - 30);
      }
    }

    return { start, end };
  }

  /**
   * Main Comprehensive Hiring Analytics Overview / Dashboard.
   */
  async getOverviewAnalytics(user: AuthUser, query?: QueryAnalyticsDto) {
    const employer = await this.getEmployerProfile(user);
    const { start, end } = this.resolveDateRange(query);
    const startMs = start.getTime();
    const endMs = end.getTime();

    // 1. Fetch employer jobs
    let employerJobs = await this.prisma.client.orm.public.Job
      .where({ employerId: employer.id })
      .all();

    if (query?.jobId) {
      const matched = employerJobs.find((j) => j.id === query.jobId);
      if (!matched && user.role !== Role.ADMIN) {
        throw new ForbiddenException(`Job #${query.jobId} does not belong to your employer profile.`);
      }
      if (matched) {
        employerJobs = [matched];
      }
    }

    const jobIds = new Set(employerJobs.map((j) => j.id));

    // 2. Fetch all applications, interviews, offers, and saved candidates
    const allApplications = await this.prisma.client.orm.public.JobApplication.all();
    const relevantApps = allApplications.filter((a) => jobIds.has(a.jobId));

    // Applications submitted within the requested date window
    const windowApps = relevantApps.filter((a) => {
      const appMs = new Date(a.appliedAt || (a as any).createdAt).getTime();
      return appMs >= startMs && appMs <= endMs;
    });

    const allInterviews = await this.prisma.client.orm.public.JobInterview
      .where({ employerId: employer.id })
      .all();
    const relevantInterviews = allInterviews.filter((i) => !query?.jobId || i.jobId === query.jobId);

    const windowInterviews = relevantInterviews.filter((i) => {
      const intMs = new Date(i.startTime).getTime();
      return intMs >= startMs && intMs <= endMs;
    });

    const allOffers = await this.prisma.client.orm.public.JobOffer
      .where({ employerId: employer.id })
      .all();
    const relevantOffers = allOffers.filter((o) => !query?.jobId || o.jobId === query.jobId);

    const windowOffers = relevantOffers.filter((o) => {
      const oMs = new Date(o.createdAt).getTime();
      return oMs >= startMs && oMs <= endMs;
    });

    // 3. Status History for stage durations & precise hire dates
    const allHistory = await this.prisma.client.orm.public.ApplicationStatusHistory.all();
    const relevantAppIds = new Set(relevantApps.map((a) => a.id));
    const relevantHistory = allHistory.filter((h) => relevantAppIds.has(h.applicationId));

    // 4. Calculate KPIs
    const totalApplications = windowApps.length;
    const activeCandidates = relevantApps.filter(
      (a) => !['hired', 'rejected', 'withdrawn'].includes(a.status),
    ).length;

    const shortlistedCount = windowApps.filter(
      (a) => a.status === 'shortlisted' || (a.status !== 'submitted' && a.status !== 'rejected'),
    ).length;

    const interviewsScheduled = windowInterviews.length;
    const interviewsCompleted = windowInterviews.filter((i) => i.status === 'completed').length;

    const offersExtended = windowOffers.filter(
      (o) => ['sent', 'accepted', 'rejected', 'expired'].includes(o.status),
    ).length;
    const offersAccepted = windowOffers.filter((o) => o.status === 'accepted').length;

    const windowHiredApps = windowApps.filter((a) => a.status === 'hired');
    const totalHired = windowHiredApps.length;
    const totalRejected = windowApps.filter((a) => a.status === 'rejected').length;

    const overallHireRatePercent =
      totalApplications > 0
        ? Number(((totalHired / totalApplications) * 100).toFixed(1))
        : 0;

    const decidedOffers = offersAccepted + windowOffers.filter((o) => o.status === 'rejected').length;
    const offerAcceptanceRatePercent =
      decidedOffers > 0
        ? Number(((offersAccepted / decidedOffers) * 100).toFixed(1))
        : offersExtended > 0
          ? Number(((offersAccepted / offersExtended) * 100).toFixed(1))
          : 0;

    // Time-to-Hire (Candidate Application to Hire)
    const timeToHireValues: number[] = [];
    for (const app of windowHiredApps) {
      const appDate = new Date(app.appliedAt || (app as any).createdAt).getTime();
      // Look for history entry where newStatus = 'hired'
      const hireHistory = relevantHistory
        .filter((h) => h.applicationId === app.id && h.newStatus === 'hired')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const hireDate =
        hireHistory.length > 0
          ? new Date(hireHistory[0].createdAt).getTime()
          : app.stageMovedAt
            ? new Date(app.stageMovedAt).getTime()
            : new Date(app.updatedAt).getTime();

      const days = Math.max(0, Math.round((hireDate - appDate) / (1000 * 60 * 60 * 24)));
      timeToHireValues.push(days);
    }

    const avgTimeToHireDays =
      timeToHireValues.length > 0
        ? Number(
            (
              timeToHireValues.reduce((acc, v) => acc + v, 0) /
              timeToHireValues.length
            ).toFixed(1),
          )
        : null;

    // Time-to-Fill (Job Created/Published to Hire)
    const timeToFillValues: number[] = [];
    for (const job of employerJobs) {
      const jobHires = windowHiredApps.filter((a) => a.jobId === job.id);
      if (jobHires.length > 0) {
        const jobStart = new Date(job.publishedAt || job.createdAt).getTime();
        for (const app of jobHires) {
          const appHireDate = app.stageMovedAt
            ? new Date(app.stageMovedAt).getTime()
            : new Date(app.updatedAt).getTime();
          const days = Math.max(0, Math.round((appHireDate - jobStart) / (1000 * 60 * 60 * 24)));
          timeToFillValues.push(days);
        }
      }
    }

    const avgTimeToFillDays =
      timeToFillValues.length > 0
        ? Number(
            (
              timeToFillValues.reduce((acc, v) => acc + v, 0) /
              timeToFillValues.length
            ).toFixed(1),
          )
        : null;

    const kpis: AnalyticsKpis = {
      totalApplications,
      activeCandidates,
      shortlistedCount,
      interviewsScheduled,
      interviewsCompleted,
      offersExtended,
      offersAccepted,
      totalHired,
      totalRejected,
      overallHireRatePercent,
      offerAcceptanceRatePercent,
      avgTimeToHireDays,
      avgTimeToFillDays,
    };

    // 5. Funnel Conversion & Bottleneck Analysis
    const funnel = await this.buildPipelineFunnel(
      employer.id,
      relevantApps,
      relevantHistory,
      query?.jobId,
    );

    // 6. Timeline Trends
    const timeline = this.buildTimelineTrends(
      start,
      end,
      windowApps,
      windowInterviews,
      windowOffers,
      windowHiredApps,
      query?.timeframe || '30d',
    );

    // 7. Time to Hire Deep Dive
    const timeToHire = this.buildTimeToHireStats(
      timeToHireValues,
      employerJobs,
      windowHiredApps,
      relevantHistory,
    );

    // 8. Candidate Source Breakdown
    const candidateSources = await this.buildCandidateSourceBreakdown(
      employer.id,
      windowApps,
      windowInterviews,
      windowHiredApps,
    );

    // 9. Top Rejection Reasons
    const topRejectionReasons = this.buildTopRejectionReasons(windowApps);

    // 10. Job Performance Scorecards
    const jobPerformance = this.buildJobPerformanceList(
      employerJobs,
      relevantApps,
      relevantInterviews,
      relevantOffers,
    );

    // 11. Interview Analytics Summary
    const interviewAnalytics = this.buildInterviewSummary(relevantInterviews, windowInterviews);

    return {
      timeframe: query?.timeframe || '30d',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      kpis,
      funnel,
      timeline,
      timeToHire,
      candidateSources,
      topRejectionReasons,
      jobPerformance,
      interviewAnalytics,
    };
  }

  /**
   * Build Pipeline Conversion Funnel with drop-offs and stage durations.
   */
  private async buildPipelineFunnel(
    employerId: string,
    apps: any[],
    history: any[],
    jobId?: string,
  ): Promise<{
    stages: FunnelStageMetric[];
    bottleneckStage: string | null;
    overallConversionRate: number;
  }> {
    // 1. Get employer stages
    let stages = await this.prisma.client.orm.public.PipelineStage
      .where({ employerId })
      .all();

    if (jobId) {
      const jobStages = stages.filter((s) => s.jobId === jobId);
      if (jobStages.length > 0) {
        stages = jobStages;
      } else {
        stages = stages.filter((s) => !s.jobId);
      }
    } else {
      stages = stages.filter((s) => !s.jobId);
    }

    if (stages.length === 0) {
      // Platform default stages
      stages = [
        { id: 'stg-app', name: 'Applied', stageType: 'applied', order: 0, color: '#3b82f6' } as any,
        { id: 'stg-scr', name: 'Screening', stageType: 'screening', order: 1, color: '#06b6d4' } as any,
        { id: 'stg-int', name: 'Interview', stageType: 'interview', order: 2, color: '#8b5cf6' } as any,
        { id: 'stg-off', name: 'Offer', stageType: 'offer', order: 3, color: '#ec4899' } as any,
        { id: 'stg-hir', name: 'Hired', stageType: 'hired', order: 4, color: '#10b981' } as any,
      ];
    }

    stages.sort((a, b) => a.order - b.order);

    const totalApps = apps.length;
    const stageMetrics: FunnelStageMetric[] = [];
    let prevCount = totalApps;
    let bottleneckStage: string | null = null;
    let maxDaysInStage = -1;

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      // Count candidates who are currently in or progressed past this stage
      let candidateCount = 0;

      if (s.stageType === 'applied' || s.order === 0) {
        candidateCount = totalApps;
      } else if (s.stageType === 'hired') {
        candidateCount = apps.filter((a) => a.status === 'hired').length;
      } else if (s.stageType === 'offer') {
        candidateCount = apps.filter(
          (a) => a.stageId === s.id || ['offered', 'hired'].includes(a.status),
        ).length;
      } else if (s.stageType === 'interview') {
        candidateCount = apps.filter(
          (a) =>
            a.stageId === s.id ||
            ['interview', 'offered', 'hired'].includes(a.status),
        ).length;
      } else if (s.stageType === 'screening') {
        candidateCount = apps.filter(
          (a) =>
            a.stageId === s.id ||
            !['submitted', 'applied'].includes(a.status),
        ).length;
      } else {
        candidateCount = apps.filter((a) => a.stageId === s.id).length;
      }

      const conversionRatePercent =
        prevCount > 0 ? Number(((candidateCount / prevCount) * 100).toFixed(1)) : 0;
      const dropoffCount = Math.max(0, prevCount - candidateCount);

      // Average duration in stage (from history or stageMovedAt)
      const appsInStage = apps.filter((a) => a.stageId === s.id);
      let totalDays = 0;
      const nowMs = Date.now();
      for (const a of appsInStage) {
        const movedMs = a.stageMovedAt
          ? new Date(a.stageMovedAt).getTime()
          : new Date(a.appliedAt || (a as any).createdAt).getTime();
        totalDays += Math.max(0, (nowMs - movedMs) / (1000 * 60 * 60 * 24));
      }
      const avgDaysInStage =
        appsInStage.length > 0 ? Number((totalDays / appsInStage.length).toFixed(1)) : 0;

      if (avgDaysInStage > maxDaysInStage && appsInStage.length > 0) {
        maxDaysInStage = avgDaysInStage;
        bottleneckStage = s.name;
      }

      stageMetrics.push({
        stageId: s.id,
        stageName: s.name,
        stageType: s.stageType,
        order: s.order,
        color: s.color || '#64748b',
        candidateCount,
        conversionRatePercent,
        dropoffCount,
        avgDaysInStage,
      });

      prevCount = candidateCount;
    }

    const hiredCount = apps.filter((a) => a.status === 'hired').length;
    const overallConversionRate =
      totalApps > 0 ? Number(((hiredCount / totalApps) * 100).toFixed(1)) : 0;

    return {
      stages: stageMetrics,
      bottleneckStage,
      overallConversionRate,
    };
  }

  /**
   * Build timeline trend points for applications, interviews, offers, and hires.
   */
  private buildTimelineTrends(
    start: Date,
    end: Date,
    apps: any[],
    interviews: any[],
    offers: any[],
    hires: any[],
    timeframe: AnalyticsTimeframe,
  ): TimelineDataPoint[] {
    const pointsMap = new Map<string, TimelineDataPoint>();
    const isMonthly = timeframe === '1y' || timeframe === 'all';
    const isWeekly = timeframe === '90d';

    const current = new Date(start.getTime());
    while (current <= end) {
      let key: string;
      let label: string;

      if (isMonthly) {
        key = current.toISOString().slice(0, 7); // YYYY-MM
        label = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        current.setMonth(current.getMonth() + 1);
      } else if (isWeekly) {
        key = current.toISOString().slice(0, 10);
        label = `Wk ${Math.ceil(current.getDate() / 7)} ${current.toLocaleDateString('en-US', { month: 'short' })}`;
        current.setDate(current.getDate() + 7);
      } else {
        key = current.toISOString().slice(0, 10); // YYYY-MM-DD
        label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        current.setDate(current.getDate() + 1);
      }

      if (!pointsMap.has(key)) {
        pointsMap.set(key, { period: key, label, applications: 0, interviews: 0, offers: 0, hires: 0 });
      }
    }

    const getKey = (dateStr: string) => {
      if (isMonthly) return dateStr.slice(0, 7);
      if (isWeekly) {
        const d = new Date(dateStr);
        // Find closest week start in map
        for (const k of pointsMap.keys()) {
          const kDate = new Date(k);
          if (Math.abs(d.getTime() - kDate.getTime()) <= 7 * 24 * 60 * 60 * 1000) {
            return k;
          }
        }
      }
      return dateStr.slice(0, 10);
    };

    // Populate applications
    for (const a of apps) {
      const d = a.appliedAt || (a as any).createdAt;
      if (d) {
        const k = getKey(d);
        if (pointsMap.has(k)) pointsMap.get(k)!.applications += 1;
      }
    }

    // Populate interviews
    for (const i of interviews) {
      if (i.startTime) {
        const k = getKey(i.startTime);
        if (pointsMap.has(k)) pointsMap.get(k)!.interviews += 1;
      }
    }

    // Populate offers
    for (const o of offers) {
      if (o.createdAt) {
        const k = getKey(o.createdAt);
        if (pointsMap.has(k)) pointsMap.get(k)!.offers += 1;
      }
    }

    // Populate hires
    for (const h of hires) {
      const d = h.stageMovedAt || h.updatedAt;
      if (d) {
        const k = getKey(d);
        if (pointsMap.has(k)) pointsMap.get(k)!.hires += 1;
      }
    }

    return Array.from(pointsMap.values());
  }

  /**
   * Build detailed Time-to-Hire and Time-to-Fill distributions.
   */
  private buildTimeToHireStats(
    values: number[],
    jobs: any[],
    hiredApps: any[],
    history: any[],
  ) {
    if (values.length === 0) {
      return {
        overallAvgDays: null,
        medianDays: null,
        minDays: null,
        maxDays: null,
        totalHires: 0,
        byJob: [],
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const avg = Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1));

    // Breakdown by job
    const byJob: Array<{ jobId: string; jobTitle: string; avgTimeToHireDays: number; hiresCount: number }> = [];
    for (const job of jobs) {
      const jobHires = hiredApps.filter((a) => a.jobId === job.id);
      if (jobHires.length > 0) {
        let jobTotal = 0;
        for (const app of jobHires) {
          const appDate = new Date(app.appliedAt || (app as any).createdAt).getTime();
          const hireDate = app.stageMovedAt
            ? new Date(app.stageMovedAt).getTime()
            : new Date(app.updatedAt).getTime();
          jobTotal += Math.max(0, Math.round((hireDate - appDate) / (1000 * 60 * 60 * 24)));
        }
        byJob.push({
          jobId: job.id,
          jobTitle: job.title,
          avgTimeToHireDays: Number((jobTotal / jobHires.length).toFixed(1)),
          hiresCount: jobHires.length,
        });
      }
    }

    return {
      overallAvgDays: avg,
      medianDays: Number(median.toFixed(1)),
      minDays: sorted[0],
      maxDays: sorted[sorted.length - 1],
      totalHires: sorted.length,
      byJob,
    };
  }

  /**
   * Build candidate sourcing channels analysis.
   */
  private async buildCandidateSourceBreakdown(
    employerId: string,
    apps: any[],
    interviews: any[],
    hires: any[],
  ) {
    const savedCandidates = await this.prisma.client.orm.public.SavedCandidate
      .where({ employerId })
      .all();
    const savedCandidateIds = new Set(savedCandidates.map((s) => s.profileId));

    let directCount = 0;
    let directHires = 0;
    let directInterviews = 0;

    let sourcedCount = 0;
    let sourcedHires = 0;
    let sourcedInterviews = 0;

    const interviewAppIds = new Set(interviews.map((i) => i.applicationId));
    const hiredAppIds = new Set(hires.map((h) => h.id));

    for (const app of apps) {
      const isSourced = savedCandidateIds.has(app.profileId);
      if (isSourced) {
        sourcedCount += 1;
        if (interviewAppIds.has(app.id)) sourcedInterviews += 1;
        if (hiredAppIds.has(app.id)) sourcedHires += 1;
      } else {
        directCount += 1;
        if (interviewAppIds.has(app.id)) directInterviews += 1;
        if (hiredAppIds.has(app.id)) directHires += 1;
      }
    }

    const total = apps.length;

    return [
      {
        channel: 'Direct Applications',
        description: 'Candidates who applied directly through the Fruitful job board',
        applicantCount: directCount,
        percentageOfTotal: total > 0 ? Number(((directCount / total) * 100).toFixed(1)) : 0,
        interviewsCount: directInterviews,
        hiresCount: directHires,
        hireConversionRatePercent:
          directCount > 0 ? Number(((directHires / directCount) * 100).toFixed(1)) : 0,
      },
      {
        channel: 'Employer Sourced / Talent Pool',
        description: 'Candidates bookmarked from talent search and invited to apply',
        applicantCount: sourcedCount,
        percentageOfTotal: total > 0 ? Number(((sourcedCount / total) * 100).toFixed(1)) : 0,
        interviewsCount: sourcedInterviews,
        hiresCount: sourcedHires,
        hireConversionRatePercent:
          sourcedCount > 0 ? Number(((sourcedHires / sourcedCount) * 100).toFixed(1)) : 0,
      },
    ];
  }

  /**
   * Aggregate top rejection reasons.
   */
  private buildTopRejectionReasons(apps: any[]) {
    const rejected = apps.filter((a) => a.status === 'rejected');
    const total = rejected.length;
    const reasonCounts: Record<string, { count: number; category: string }> = {};

    for (const app of rejected) {
      const code = app.rejectionReasonCode || 'unspecified';
      const cat = app.rejectionCategory || 'other';
      if (!reasonCounts[code]) {
        reasonCounts[code] = { count: 0, category: cat };
      }
      reasonCounts[code].count += 1;
    }

    return Object.entries(reasonCounts)
      .map(([code, data]) => ({
        reasonCode: code,
        category: data.category,
        count: data.count,
        percentage: total > 0 ? Number(((data.count / total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Build per-job performance metrics table.
   */
  private buildJobPerformanceList(
    jobs: any[],
    apps: any[],
    interviews: any[],
    offers: any[],
  ): JobPerformanceItem[] {
    const nowMs = Date.now();

    return jobs.map((job) => {
      const jobApps = apps.filter((a) => a.jobId === job.id);
      const jobInts = interviews.filter((i) => i.jobId === job.id);
      const jobOffs = offers.filter((o) => o.jobId === job.id);

      const applicantsCount = jobApps.length;
      const screenedCount = jobApps.filter((a) => a.status !== 'submitted').length;
      const interviewedCount = jobInts.length;
      const offeredCount = jobOffs.length;
      const hiredApps = jobApps.filter((a) => a.status === 'hired');
      const hiredCount = hiredApps.length;
      const rejectedCount = jobApps.filter((a) => a.status === 'rejected').length;

      const conversionRatePercent =
        applicantsCount > 0 ? Number(((hiredCount / applicantsCount) * 100).toFixed(1)) : 0;

      const pubDate = job.publishedAt ? new Date(job.publishedAt).getTime() : new Date(job.createdAt).getTime();
      const daysOpen = Math.max(0, Math.round((nowMs - pubDate) / (1000 * 60 * 60 * 24)));

      let avgTimeToHireDays: number | null = null;
      if (hiredCount > 0) {
        let totalHireDays = 0;
        for (const app of hiredApps) {
          const appMs = new Date(app.appliedAt || (app as any).createdAt).getTime();
          const hireMs = app.stageMovedAt
            ? new Date(app.stageMovedAt).getTime()
            : new Date(app.updatedAt).getTime();
          totalHireDays += Math.max(0, Math.round((hireMs - appMs) / (1000 * 60 * 60 * 24)));
        }
        avgTimeToHireDays = Number((totalHireDays / hiredCount).toFixed(1));
      }

      // Health status indicator
      let healthStatus: 'healthy' | 'at_risk' | 'needs_attention' = 'healthy';
      if (job.status === 'published') {
        if (daysOpen > 45 && hiredCount === 0 && applicantsCount < 5) {
          healthStatus = 'needs_attention';
        } else if (daysOpen > 30 && hiredCount === 0) {
          healthStatus = 'at_risk';
        }
      }

      return {
        jobId: job.id,
        title: job.title,
        category: job.category || 'General',
        status: job.status,
        publishedAt: job.publishedAt,
        daysOpen,
        applicantsCount,
        screenedCount,
        interviewedCount,
        offeredCount,
        hiredCount,
        rejectedCount,
        conversionRatePercent,
        avgTimeToHireDays,
        healthStatus,
      };
    });
  }

  /**
   * Build interview statistics summary.
   */
  private buildInterviewSummary(allInterviews: any[], windowInterviews: any[]) {
    const total = windowInterviews.length;
    const scheduled = windowInterviews.filter((i) => i.status === 'scheduled').length;
    const completed = windowInterviews.filter((i) => i.status === 'completed').length;
    const cancelled = windowInterviews.filter((i) => i.status === 'cancelled').length;
    const rescheduled = windowInterviews.filter((i) => i.status === 'rescheduled').length;

    const ratedInterviews = windowInterviews.filter((i) => i.rating && i.rating > 0);
    const avgRating =
      ratedInterviews.length > 0
        ? Number(
            (
              ratedInterviews.reduce((acc, i) => acc + i.rating, 0) /
              ratedInterviews.length
            ).toFixed(1),
          )
        : null;

    const typeBreakdown: Record<string, number> = {};
    for (const i of windowInterviews) {
      const t = i.interviewType || 'video';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    }

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const i of ratedInterviews) {
      if (ratingDistribution[i.rating] !== undefined) {
        ratingDistribution[i.rating] += 1;
      }
    }

    return {
      totalInterviews: total,
      scheduled,
      completed,
      cancelled,
      rescheduled,
      completionRatePercent:
        completed + cancelled > 0
          ? Number(((completed / (completed + cancelled)) * 100).toFixed(1))
          : total > 0
            ? 100
            : 0,
      averageRating: avgRating,
      ratingDistribution,
      typeBreakdown,
    };
  }

  /**
   * Dedicated endpoint: Deep-dive Time-to-Hire & Time-to-Fill analytics.
   */
  async getTimeToHireAnalytics(user: AuthUser, query?: QueryAnalyticsDto) {
    const overview = await this.getOverviewAnalytics(user, query);
    return {
      timeframe: overview.timeframe,
      startDate: overview.startDate,
      endDate: overview.endDate,
      avgTimeToHireDays: overview.kpis.avgTimeToHireDays,
      avgTimeToFillDays: overview.kpis.avgTimeToFillDays,
      timeToHireStats: overview.timeToHire,
      bottleneckStage: overview.funnel.bottleneckStage,
      stages: overview.funnel.stages.map((s) => ({
        stageName: s.stageName,
        avgDaysInStage: s.avgDaysInStage,
      })),
      jobBreakdown: overview.jobPerformance.map((j) => ({
        jobId: j.jobId,
        title: j.title,
        daysOpen: j.daysOpen,
        avgTimeToHireDays: j.avgTimeToHireDays,
        hiredCount: j.hiredCount,
      })),
    };
  }

  /**
   * Dedicated endpoint: Pipeline conversion funnel and drop-off analysis.
   */
  async getPipelineFunnelAnalytics(user: AuthUser, query?: QueryAnalyticsDto) {
    const overview = await this.getOverviewAnalytics(user, query);
    return {
      timeframe: overview.timeframe,
      totalApplications: overview.kpis.totalApplications,
      totalHired: overview.kpis.totalHired,
      overallConversionRate: overview.funnel.overallConversionRate,
      bottleneckStage: overview.funnel.bottleneckStage,
      stages: overview.funnel.stages,
      topRejectionReasons: overview.topRejectionReasons,
    };
  }

  /**
   * Dedicated endpoint: Comparative job benchmarking.
   */
  async getJobBenchmarkAnalytics(user: AuthUser, query?: QueryJobBenchmarkDto) {
    const overview = await this.getOverviewAnalytics(user, query);
    let jobs = [...overview.jobPerformance];

    const sortBy = query?.sortBy || 'applicants';
    const sortOrder = query?.sortOrder || 'desc';
    const mult = sortOrder === 'desc' ? -1 : 1;

    jobs.sort((a, b) => {
      switch (sortBy) {
        case 'applicants':
          return (a.applicantsCount - b.applicantsCount) * mult;
        case 'hires':
          return (a.hiredCount - b.hiredCount) * mult;
        case 'conversion':
          return (a.conversionRatePercent - b.conversionRatePercent) * mult;
        case 'time_to_fill':
          return ((a.avgTimeToHireDays ?? 999) - (b.avgTimeToHireDays ?? 999)) * mult;
        case 'days_open':
          return (a.daysOpen - b.daysOpen) * mult;
        case 'title':
          return a.title.localeCompare(b.title) * mult;
        default:
          return (a.applicantsCount - b.applicantsCount) * mult;
      }
    });

    const summary = {
      totalJobs: jobs.length,
      activeJobs: jobs.filter((j) => j.status === 'published').length,
      healthyJobs: jobs.filter((j) => j.healthStatus === 'healthy').length,
      atRiskJobs: jobs.filter((j) => j.healthStatus === 'at_risk').length,
      needsAttentionJobs: jobs.filter((j) => j.healthStatus === 'needs_attention').length,
    };

    return {
      summary,
      jobs,
    };
  }

  /**
   * Dedicated endpoint: Detailed Interview performance analytics.
   */
  async getInterviewAnalytics(user: AuthUser, query?: QueryAnalyticsDto) {
    const overview = await this.getOverviewAnalytics(user, query);
    return {
      timeframe: overview.timeframe,
      metrics: overview.interviewAnalytics,
    };
  }

  /**
   * Generate CSV or JSON export of Hiring Analytics Report.
   */
  async exportAnalyticsReport(user: AuthUser, query?: ExportAnalyticsDto) {
    const data = await this.getOverviewAnalytics(user, query);

    if (query?.format === 'json') {
      return { report: data };
    }

    // Format as CSV
    const lines: string[] = [];

    // 1. Executive Summary Section
    lines.push('FRUITFUL JOURNEY - HIRING ANALYTICS REPORT');
    lines.push(`Generated At,${new Date().toISOString()}`);
    lines.push(`Timeframe,${data.timeframe}`);
    lines.push(`Date Range,${data.startDate} to ${data.endDate}`);
    lines.push('');

    lines.push('EXECUTIVE METRICS');
    lines.push('Metric,Value');
    lines.push(`Total Applications,${data.kpis.totalApplications}`);
    lines.push(`Active Candidates in Pipeline,${data.kpis.activeCandidates}`);
    lines.push(`Shortlisted Candidates,${data.kpis.shortlistedCount}`);
    lines.push(`Interviews Scheduled,${data.kpis.interviewsScheduled}`);
    lines.push(`Interviews Completed,${data.kpis.interviewsCompleted}`);
    lines.push(`Offers Extended,${data.kpis.offersExtended}`);
    lines.push(`Offers Accepted,${data.kpis.offersAccepted}`);
    lines.push(`Total Hires,${data.kpis.totalHired}`);
    lines.push(`Total Rejected,${data.kpis.totalRejected}`);
    lines.push(`Overall Hire Rate (%),${data.kpis.overallHireRatePercent}%`);
    lines.push(`Offer Acceptance Rate (%),${data.kpis.offerAcceptanceRatePercent}%`);
    lines.push(`Average Time to Hire (Days),${data.kpis.avgTimeToHireDays ?? 'N/A'}`);
    lines.push(`Average Time to Fill (Days),${data.kpis.avgTimeToFillDays ?? 'N/A'}`);
    lines.push(`Bottleneck Stage,${data.funnel.bottleneckStage ?? 'None'}`);
    lines.push('');

    // 2. Pipeline Funnel Section
    lines.push('RECRUITMENT FUNNEL CONVERSION');
    lines.push('Stage Order,Stage Name,Type,Candidates Count,Conversion Rate (%),Drop-off Count,Avg Days in Stage');
    for (const s of data.funnel.stages) {
      lines.push(
        `${s.order},"${s.stageName}",${s.stageType},${s.candidateCount},${s.conversionRatePercent}%,${s.dropoffCount},${s.avgDaysInStage}`,
      );
    }
    lines.push('');

    // 3. Job Performance Section
    lines.push('JOB PERFORMANCE BENCHMARKS');
    lines.push('Job Title,Category,Status,Days Open,Applicants,Interviewed,Offered,Hired,Hire Rate (%),Avg Time to Hire (Days),Health Status');
    for (const j of data.jobPerformance) {
      lines.push(
        `"${j.title}","${j.category}",${j.status},${j.daysOpen},${j.applicantsCount},${j.interviewedCount},${j.offeredCount},${j.hiredCount},${j.conversionRatePercent}%,${j.avgTimeToHireDays ?? 'N/A'},${j.healthStatus}`,
      );
    }
    lines.push('');

    // 4. Top Rejection Reasons
    lines.push('TOP REJECTION REASONS');
    lines.push('Reason Code,Category,Count,Percentage (%)');
    for (const r of data.topRejectionReasons) {
      lines.push(`"${r.reasonCode}","${r.category}",${r.count},${r.percentage}%`);
    }

    return lines.join('\n');
  }
}
