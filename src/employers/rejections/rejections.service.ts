import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import {
  RejectCandidateDto,
  CreateRejectionReasonDto,
  QueryRejectionAnalyticsDto,
} from './dto/index.js';

export interface RejectionReasonItem {
  id: string;
  code: string;
  label: string;
  category: string;
  description: string | null;
  defaultEmailTemplate: string | null;
  isSystem: boolean;
  isActive: boolean;
}

@Injectable()
export class RejectionsService {
  private readonly logger = new Logger(RejectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * List available rejection reasons (system standards + employer custom).
   */
  async listRejectionReasons(user: AuthUser): Promise<RejectionReasonItem[]> {
    let employerId: string | null = null;
    try {
      const employer = await this.getEmployerProfile(user);
      employerId = employer.id;
    } catch {
      // Admin or user without profile will see system reasons
    }

    const allReasons = await this.prisma.client.orm.public.RejectionReason.all();

    const filtered = allReasons.filter((r) => {
      if (!r.isActive) return false;
      if (r.isSystem) return true;
      if (employerId && r.employerId === employerId) return true;
      return false;
    });

    filtered.sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    return filtered;
  }

  /**
   * Create a custom rejection reason for an employer.
   */
  async createCustomReason(user: AuthUser, dto: CreateRejectionReasonDto): Promise<RejectionReasonItem> {
    const employer = await this.getEmployerProfile(user);
    const normalizedCode = dto.code.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

    // Check uniqueness
    const existing = await this.prisma.client.orm.public.RejectionReason
      .where({ code: normalizedCode })
      .first();

    if (existing && (existing.employerId === employer.id || existing.isSystem)) {
      throw new BadRequestException(`Rejection reason code "${normalizedCode}" already exists.`);
    }

    const created = await this.prisma.client.orm.public.RejectionReason.create({
      id: randomUUID(),
      employerId: employer.id,
      code: normalizedCode,
      label: dto.label.trim(),
      category: dto.category,
      description: dto.description || null,
      defaultEmailTemplate: dto.defaultEmailTemplate || null,
      isSystem: false,
      isActive: true,
    });

    this.logger.log(`Created custom rejection reason "${normalizedCode}" for employer #${employer.id}`);
    return created;
  }

  /**
   * Reject a candidate application with structured feedback and reason.
   */
  async rejectCandidate(user: AuthUser, dto: RejectCandidateDto) {
    const employer = await this.getEmployerProfile(user);

    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: dto.applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${dto.applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employer.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to reject this application.');
    }

    // Lookup reason code
    const reasons = await this.listRejectionReasons(user);
    const reason = reasons.find((r) => r.code === dto.reasonCode);
    const category = reason ? reason.category : 'other';
    const reasonLabel = reason ? reason.label : dto.reasonCode;

    const nowIso = new Date().toISOString();
    const effectiveFeedback = dto.feedback || reason?.description || null;

    // Update application
    await this.prisma.client.orm.public.JobApplication
      .where({ id: application.id })
      .update({
        status: 'rejected',
        stageMovedAt: nowIso,
        rejectionReasonCode: dto.reasonCode,
        rejectionCategory: category,
        rejectionFeedback: effectiveFeedback,
        rejectedAt: nowIso,
        employerNotes: dto.feedback ? `Rejected: ${dto.feedback}` : application.employerNotes,
      });

    // Record status history
    await this.prisma.client.orm.public.ApplicationStatusHistory.create({
      id: randomUUID(),
      applicationId: application.id,
      previousStatus: application.status,
      newStatus: 'rejected',
      changedById: user.id,
      changedByRole: 'employer',
      notes: `Rejected (${reasonLabel}): ${effectiveFeedback || 'No feedback'}`,
    });

    // Optionally create internal evaluation note
    if (dto.createInternalNote ?? true) {
      await this.prisma.client.orm.public.CandidateNote.create({
        id: randomUUID(),
        employerId: employer.id,
        profileId: application.profileId,
        applicationId: application.id,
        authorId: user.id,
        content: `Rejection Decision [${reasonLabel}]: ${effectiveFeedback || 'Candidate application marked as rejected.'}`,
        category: 'rejection_reason',
        rating: 1,
        isPinned: false,
      });
    }

    // Candidate notification & email
    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: application.profileId })
      .first();

    if (candidateProfile && (dto.notifyCandidate ?? true) && this.notificationsService) {
      const candidateUser = await this.prisma.client.orm.public.User
        .where({ id: candidateProfile.userId })
        .first();

      if (candidateUser) {
        const rejectionEmailText = dto.customEmailContent || reason?.defaultEmailTemplate || effectiveFeedback;

        await this.notificationsService.sendCandidateRejectionNotification({
          candidateUserId: candidateUser.id,
          candidateEmail: candidateUser.email,
          candidateName: candidateUser.name || 'Candidate',
          employerName: employer.name,
          jobTitle: job.title,
          applicationId: application.id,
          rejectionReasonLabel: reasonLabel,
          rejectionFeedback: rejectionEmailText,
        });
      }
    }

    this.logger.log(`Rejected candidate application #${application.id} with reason "${dto.reasonCode}"`);

    return {
      success: true,
      applicationId: application.id,
      status: 'rejected',
      reasonCode: dto.reasonCode,
      category,
      rejectedAt: nowIso,
      message: 'Candidate application successfully rejected.',
    };
  }

  /**
   * Get structured rejection analytics and insights for an employer.
   */
  async getRejectionAnalytics(user: AuthUser, query?: QueryRejectionAnalyticsDto) {
    const employer = await this.getEmployerProfile(user);

    // Get all jobs for this employer
    let employerJobs = await this.prisma.client.orm.public.Job
      .where({ employerId: employer.id })
      .all();

    if (query?.jobId) {
      employerJobs = employerJobs.filter((j) => j.id === query.jobId);
    }

    const jobIds = new Set(employerJobs.map((j) => j.id));
    const allApplications = await this.prisma.client.orm.public.JobApplication.all();

    let rejectedApps = allApplications.filter(
      (app) => jobIds.has(app.jobId) && app.status === 'rejected',
    );

    if (query?.from) {
      const fromMs = new Date(query.from).getTime();
      rejectedApps = rejectedApps.filter(
        (app) => app.rejectedAt && new Date(app.rejectedAt).getTime() >= fromMs,
      );
    }
    if (query?.to) {
      const toMs = new Date(query.to).getTime();
      rejectedApps = rejectedApps.filter(
        (app) => app.rejectedAt && new Date(app.rejectedAt).getTime() <= toMs,
      );
    }

    const totalRejected = rejectedApps.length;

    // Category breakdown
    const categoryCounts: Record<string, number> = {};
    const reasonCodeCounts: Record<string, number> = {};
    const jobBreakdown: Record<string, { jobTitle: string; count: number }> = {};

    for (const app of rejectedApps) {
      const cat = app.rejectionCategory || 'unspecified';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      const code = app.rejectionReasonCode || 'unspecified';
      reasonCodeCounts[code] = (reasonCodeCounts[code] || 0) + 1;

      const job = employerJobs.find((j) => j.id === app.jobId);
      const jTitle = job?.title || 'Unknown Job';
      if (!jobBreakdown[app.jobId]) {
        jobBreakdown[app.jobId] = { jobTitle: jTitle, count: 0 };
      }
      jobBreakdown[app.jobId].count += 1;
    }

    const categoryBreakdown = Object.entries(categoryCounts).map(([cat, count]) => ({
      category: cat,
      count,
      percentage: totalRejected > 0 ? Number(((count / totalRejected) * 100).toFixed(1)) : 0,
    }));

    const reasonBreakdown = Object.entries(reasonCodeCounts).map(([code, count]) => ({
      code,
      count,
      percentage: totalRejected > 0 ? Number(((count / totalRejected) * 100).toFixed(1)) : 0,
    }));

    return {
      totalRejected,
      categoryBreakdown,
      reasonBreakdown,
      jobBreakdown: Object.values(jobBreakdown),
    };
  }

  private async getEmployerProfile(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      const anyEmp = await this.prisma.client.orm.public.EmployerProfile.first();
      if (anyEmp) return anyEmp;
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer) {
      throw new NotFoundException('Employer profile not found. Please complete employer registration.');
    }

    return employer;
  }
}
