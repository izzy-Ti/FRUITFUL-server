import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmployersService } from '../employers/employers.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { JobSeekersService } from '../job-seekers/job-seekers.service.js';
import { Role } from '../common/enums/role.enum.js';
import {
  QueryUsersDto,
  SuspendUserDto,
  UpdateUserRoleDto,
  ModerateJobDto,
  RejectJobDto,
  ModeratePortfolioDto,
} from './dto/index.js';
import type { ModerateTalentDto } from '../job-seekers/dto/index.js';
import { CategoriesService } from '../categories/categories.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { ControlledDataService } from '../controlled-data/controlled-data.service.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employersService: EmployersService,
    private readonly jobsService: JobsService,
    private readonly jobSeekersService: JobSeekersService,
    private readonly categoriesService: CategoriesService,
    private readonly skillsService: SkillsService,
    private readonly controlledDataService: ControlledDataService,
    @Optional()
    @Inject(NotificationsService)
    private readonly notificationsService?: NotificationsService,
  ) {}

  // ==========================================
  // USER & ACCOUNT MANAGEMENT
  // ==========================================

  /**
   * List users with optional search, role filter, account status filter, and pagination.
   */
  async listUsers(query?: QueryUsersDto) {
    let collection = this.prisma.client.orm.public.User;

    if (query?.role) {
      collection = collection.where((u) => u.role.eq(query.role!));
    }

    if (query?.status) {
      collection = collection.where((u) => u.status.eq(query.status!));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((u) =>
        u.email.ilike(term) || u.name.ilike(term),
      );
    }

    const allUsers = await collection.orderBy((u) => u.createdAt.desc()).all();
    const total = allUsers.length;

    const page = query?.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query?.limit && query.limit > 0 ? Number(query.limit) : 20;
    const paginated = allUsers.slice((page - 1) * limit, page * limit);

    // Enrich users with profile summaries
    const enriched = await Promise.all(
      paginated.map(async (u) => {
        let profileSummary: Record<string, any> | null = null;
        if (u.role === Role.JOB_SEEKER) {
          const profile = await this.prisma.client.orm.public.JobSeekerProfile
            .where({ userId: u.id })
            .first();
          if (profile) {
            profileSummary = {
              profileId: profile.id,
              headline: profile.headline,
              location: profile.location,
              approvalStatus: profile.approvalStatus,
              visibility: profile.visibility,
            };
          }
        } else if (u.role === Role.EMPLOYER) {
          const profile = await this.prisma.client.orm.public.EmployerProfile
            .where({ userId: u.id })
            .first();
          if (profile) {
            profileSummary = {
              employerId: profile.id,
              name: profile.name,
              industry: profile.industry,
              verificationStatus: profile.verificationStatus,
            };
          }
        }

        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          status: u.status || 'active',
          suspendedAt: u.suspendedAt || null,
          suspensionReason: u.suspensionReason || null,
          profileSummary,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      }),
    );

    return {
      count: enriched.length,
      total,
      page,
      limit,
      users: enriched,
    };
  }

  /**
   * Get full details of a specific user including their linked profiles and stats.
   */
  async getUserById(userId: string) {
    const user = await this.prisma.client.orm.public.User
      .where({ id: userId })
      .first();

    if (!user) {
      throw new NotFoundException(`User with ID "${userId}" was not found.`);
    }

    let jobSeekerProfile: any = null;
    let employerProfile: any = null;

    if (user.role === Role.JOB_SEEKER || !user.role) {
      try {
        jobSeekerProfile = await this.jobSeekersService.getFullProfileByUserId(user.id);
      } catch {
        // No profile created yet
      }
    }

    if (user.role === Role.EMPLOYER) {
      try {
        employerProfile = await this.employersService.getMyProfile(user.id);
      } catch {
        // No employer profile created yet
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status || 'active',
      suspendedAt: user.suspendedAt || null,
      suspensionReason: user.suspensionReason || null,
      jobSeekerProfile,
      employerProfile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update a user's role.
   */
  async updateUserRole(adminUserId: string, targetUserId: string, dto: UpdateUserRoleDto) {
    const user = await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .first();

    if (!user) {
      throw new NotFoundException(`User with ID "${targetUserId}" was not found.`);
    }

    await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .update({ role: dto.role });

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'USER_ROLE_CHANGE',
      targetEntity: 'User',
      targetId: targetUserId,
      details: { email: user.email, previousRole: user.role, newRole: dto.role },
    });

    this.logger.log(`Admin ${adminUserId} updated role for user ${targetUserId} to ${dto.role}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: dto.role,
      status: user.status || 'active',
      message: `User role updated to ${dto.role}.`,
    };
  }

  /**
   * Suspend a user account with an audit reason.
   */
  async suspendUser(adminUserId: string, targetUserId: string, dto: SuspendUserDto) {
    if (adminUserId === targetUserId) {
      throw new BadRequestException('Administrators cannot suspend their own account.');
    }

    const user = await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .first();

    if (!user) {
      throw new NotFoundException(`User with ID "${targetUserId}" was not found.`);
    }

    const nowIso = new Date().toISOString();

    await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .update({
        status: 'suspended',
        suspendedAt: nowIso,
        suspensionReason: dto.reason,
      });

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'USER_SUSPEND',
      targetEntity: 'User',
      targetId: targetUserId,
      details: { email: user.email, reason: dto.reason },
    });

    if (this.notificationsService) {
      await this.notificationsService.sendAdminModerationAlert({
        adminUserId,
        alertType: 'user_suspended',
        title: `Account Suspended: ${user.email}`,
        message: `Account has been suspended by administrator. Reason: ${dto.reason}`,
        entityType: 'User',
        entityId: targetUserId,
        targetUserId,
      });
    }

    this.logger.log(`Admin ${adminUserId} suspended user ${targetUserId}. Reason: ${dto.reason}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: 'suspended',
      suspendedAt: nowIso,
      suspensionReason: dto.reason,
      message: `Account for ${user.email} has been suspended.`,
    };
  }

  /**
   * Reactivate a suspended user account.
   */
  async reactivateUser(adminUserId: string, targetUserId: string) {
    const user = await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .first();

    if (!user) {
      throw new NotFoundException(`User with ID "${targetUserId}" was not found.`);
    }

    await this.prisma.client.orm.public.User
      .where({ id: targetUserId })
      .update({
        status: 'active',
        suspendedAt: null,
        suspensionReason: null,
      });

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'USER_REACTIVATE',
      targetEntity: 'User',
      targetId: targetUserId,
      details: { email: user.email },
    });

    this.logger.log(`Admin ${adminUserId} reactivated user ${targetUserId}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: 'active',
      message: `Account for ${user.email} has been reactivated.`,
    };
  }

  /**
   * Approve a user account.
   */
  async approveUser(adminUserId: string, targetUserId: string) {
    return this.reactivateUser(adminUserId, targetUserId);
  }

  // ==========================================
  // EMPLOYER REVIEW & VERIFICATION
  // ==========================================

  /**
   * List employers with verification status filtering and audit details.
   */
  async listEmployers(query?: { verificationStatus?: string; search?: string; limit?: number }) {
    return this.employersService.findAllAdmin(query);
  }

  /**
   * Get complete employer details including verification history.
   */
  async getEmployerById(employerId: string) {
    const profile = await this.employersService.getProfileById(employerId);
    const history = await this.employersService.getVerificationHistory(employerId);
    return {
      ...profile,
      verificationHistory: history,
    };
  }

  /**
   * Retrieve verification audit trail for an employer.
   */
  async getEmployerVerificationHistory(employerId: string) {
    return this.employersService.getVerificationHistory(employerId);
  }

  /**
   * Verify or reject an employer organization.
   */
  async verifyEmployer(
    adminUserId: string,
    employerId: string,
    status: 'verified' | 'rejected',
    rejectionReason?: string,
  ) {
    const result = await this.employersService.updateVerificationStatus(
      employerId,
      { status, rejectionReason },
      adminUserId,
    );

    await this.createAuditRecord({
      adminId: adminUserId,
      action: status === 'verified' ? 'EMPLOYER_VERIFY' : 'EMPLOYER_REJECT',
      targetEntity: 'EmployerProfile',
      targetId: employerId,
      details: { status, rejectionReason: rejectionReason || null },
    });

    return result;
  }

  // ==========================================
  // JOB APPROVAL, REJECTION & REMOVAL
  // ==========================================

  /**
   * List all jobs with status filtering and employer details.
   */
  async listJobs(query?: any) {
    return this.jobsService.findAllAdmin(query);
  }

  /**
   * Approve a job listing (publish).
   */
  async approveJob(adminUserId: string, jobId: string, dto?: ModerateJobDto) {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    const nowIso = new Date().toISOString();

    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .update({
        status: 'published',
        publishedAt: nowIso,
        closedAt: null,
        adminNotes: dto?.adminNotes || 'Approved by administrator.',
      });

    this.logger.log(`Admin ${adminUserId} approved job ${jobId}`);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'JOB_APPROVE',
      targetEntity: 'Job',
      targetId: jobId,
      details: { title: existing.title, adminNotes: dto?.adminNotes || 'Approved by administrator.' },
    });

    const updated = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    return this.jobsService.getJobById(jobId);
  }

  /**
   * Reject a job listing.
   */
  async rejectJob(adminUserId: string, jobId: string, dto: RejectJobDto) {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    const nowIso = new Date().toISOString();

    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .update({
        status: 'closed',
        closedAt: nowIso,
        adminNotes: dto.reason || 'Rejected by administrator.',
      });

    this.logger.log(`Admin ${adminUserId} rejected job ${jobId}. Reason: ${dto.reason}`);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'JOB_REJECT',
      targetEntity: 'Job',
      targetId: jobId,
      details: { title: existing.title, reason: dto.reason },
    });

    return this.jobsService.getJobById(jobId);
  }

  /**
   * Remove a job listing permanently.
   */
  async removeJob(adminUserId: string, jobId: string) {
    const result = await this.jobsService.deleteJob(adminUserId, jobId, true);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'JOB_REMOVE',
      targetEntity: 'Job',
      targetId: jobId,
    });

    return result;
  }

  // ==========================================
  // PROFILE & PORTFOLIO CONTENT MODERATION
  // ==========================================

  /**
   * List talent profiles with approval status filtering.
   */
  async listTalentProfiles(query?: any) {
    return this.jobSeekersService.searchTalent({
      ...query,
      viewerRole: Role.ADMIN,
    });
  }

  /**
   * Moderate a candidate profile (approve, reject, pending).
   */
  async moderateTalentProfile(adminUserId: string, profileId: string, dto: ModerateTalentDto) {
    const result = await this.jobSeekersService.moderateTalentProfile(adminUserId, profileId, dto);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'TALENT_MODERATE',
      targetEntity: 'JobSeekerProfile',
      targetId: profileId,
      details: { approvalStatus: dto.approvalStatus, adminNotes: dto.adminNotes || null },
    });

    return result;
  }

  /**
   * List portfolio projects for moderation.
   */
  async listPortfolioProjects(query?: { moderationStatus?: string; limit?: number }) {
    let collection = this.prisma.client.orm.public.PortfolioProject;

    if (query?.moderationStatus && query.moderationStatus !== 'all') {
      collection = collection.where((p) => p.moderationStatus.eq(query.moderationStatus!));
    }

    const projects = await collection
      .orderBy((p) => p.createdAt.desc())
      .limit(query?.limit || 50)
      .all();

    return Promise.all(
      projects.map(async (project) => {
        const profile = await this.prisma.client.orm.public.JobSeekerProfile
          .where({ id: project.profileId })
          .first();

        let authorName: string | null = null;
        let authorEmail: string | null = null;

        if (profile) {
          const user = await this.prisma.client.orm.public.User
            .where({ id: profile.userId })
            .first();
          authorName = user?.name || null;
          authorEmail = user?.email || null;
        }

        return {
          ...project,
          moderationStatus: project.moderationStatus || 'approved',
          adminNotes: project.adminNotes || null,
          author: {
            profileId: project.profileId,
            name: authorName,
            email: authorEmail,
          },
        };
      }),
    );
  }

  /**
   * Moderate portfolio project content (approve, flag, reject).
   */
  async moderatePortfolioProject(
    adminUserId: string,
    projectId: string,
    dto: ModeratePortfolioDto,
  ) {
    const project = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .first();

    if (!project) {
      throw new NotFoundException(`Portfolio project with ID "${projectId}" was not found.`);
    }

    const updated = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .update({
        moderationStatus: dto.status,
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes } : {}),
      });

    this.logger.log(`Admin ${adminUserId} moderated portfolio project ${projectId} to "${dto.status}"`);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'PORTFOLIO_MODERATE',
      targetEntity: 'PortfolioProject',
      targetId: projectId,
      details: { title: project.title, status: dto.status, adminNotes: dto.adminNotes || null },
    });

    if (this.notificationsService) {
      await this.notificationsService.sendAdminModerationAlert({
        adminUserId,
        alertType: 'portfolio_flagged',
        title: `Portfolio Moderation: ${project.title}`,
        message: `Portfolio project "${project.title}" has been moderated to "${dto.status}".`,
        entityType: 'PortfolioProject',
        entityId: projectId,
      });
    }

    return {
      id: project.id,
      title: project.title,
      moderationStatus: dto.status,
      adminNotes: dto.adminNotes || null,
      message: `Portfolio project moderation status updated to ${dto.status}.`,
    };
  }

  /**
   * Remove an inappropriate portfolio project.
   */
  async removePortfolioProject(adminUserId: string, projectId: string) {
    const project = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .first();

    if (!project) {
      throw new NotFoundException(`Portfolio project with ID "${projectId}" was not found.`);
    }

    await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .delete();

    this.logger.log(`Admin ${adminUserId} removed portfolio project ${projectId}`);

    await this.createAuditRecord({
      adminId: adminUserId,
      action: 'PORTFOLIO_REMOVE',
      targetEntity: 'PortfolioProject',
      targetId: projectId,
      details: { title: project.title },
    });

    return {
      success: true,
      message: `Portfolio project "${project.title}" has been permanently removed by administrator.`,
    };
  }

  // ==========================================
  // OPERATIONAL DASHBOARD STATS
  // ==========================================

  /**
   * Retrieve platform-wide operational statistics.
   */
  async getDashboardStats() {
    const [allUsers, allEmployers, allJobs, allProfiles, allProjects] = await Promise.all([
      this.prisma.client.orm.public.User.all(),
      this.prisma.client.orm.public.EmployerProfile.all(),
      this.prisma.client.orm.public.Job.all(),
      this.prisma.client.orm.public.JobSeekerProfile.all(),
      this.prisma.client.orm.public.PortfolioProject.all(),
    ]);

    // Users breakdown
    const usersByRole = {
      jobSeekers: allUsers.filter((u) => u.role === Role.JOB_SEEKER).length,
      employers: allUsers.filter((u) => u.role === Role.EMPLOYER).length,
      admins: allUsers.filter((u) => u.role === Role.ADMIN).length,
    };

    const usersByStatus = {
      active: allUsers.filter((u) => (u.status || 'active') === 'active').length,
      suspended: allUsers.filter((u) => u.status === 'suspended').length,
      pending: allUsers.filter((u) => u.status === 'pending').length,
    };

    // Employers breakdown
    const employersByVerification = {
      verified: allEmployers.filter((e) => e.verificationStatus === 'verified').length,
      pending: allEmployers.filter((e) => e.verificationStatus === 'pending').length,
      rejected: allEmployers.filter((e) => e.verificationStatus === 'rejected').length,
    };

    // Jobs breakdown
    const jobsByStatus = {
      published: allJobs.filter((j) => j.status === 'published').length,
      draft: allJobs.filter((j) => j.status === 'draft').length,
      closed: allJobs.filter((j) => j.status === 'closed').length,
    };

    // Talent Profiles breakdown
    const profilesByApproval = {
      approved: allProfiles.filter((p) => (p.approvalStatus || 'approved') === 'approved').length,
      pending: allProfiles.filter((p) => p.approvalStatus === 'pending').length,
      rejected: allProfiles.filter((p) => p.approvalStatus === 'rejected').length,
    };

    // Portfolio projects breakdown
    const portfolioByModeration = {
      approved: allProjects.filter((p) => (p.moderationStatus || 'approved') === 'approved').length,
      flagged: allProjects.filter((p) => p.moderationStatus === 'flagged').length,
      rejected: allProjects.filter((p) => p.moderationStatus === 'rejected').length,
    };

    return {
      users: {
        total: allUsers.length,
        byRole: usersByRole,
        byStatus: usersByStatus,
      },
      employers: {
        total: allEmployers.length,
        byVerification: employersByVerification,
      },
      jobs: {
        total: allJobs.length,
        byStatus: jobsByStatus,
      },
      talentProfiles: {
        total: allProfiles.length,
        byApproval: profilesByApproval,
      },
      portfolio: {
        total: allProjects.length,
        byModeration: portfolioByModeration,
      },
    };
  }

  // ==========================================
  // PLATFORM ACTIVITY & EMPLOYMENT IMPACT METRICS
  // ==========================================

  /**
   * Retrieve platform activity volume across timeframes (24h, 7d, 30d, all-time) and timeline.
   */
  async getPlatformActivityMetrics() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [allUsers, allJobs, allApplications, allStatusHistories] = await Promise.all([
      this.prisma.client.orm.public.User.all(),
      this.prisma.client.orm.public.Job.all(),
      this.prisma.client.orm.public.JobApplication.all(),
      this.prisma.client.orm.public.ApplicationStatusHistory.all(),
    ]);

    const countSince = (items: Array<any>, date: Date) =>
      items.filter((item) => {
        const timestamp = item.createdAt || item.appliedAt;
        return timestamp && new Date(timestamp) >= date;
      }).length;

    // Funnel counts across application stages
    const funnelStages = ['submitted', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn'];
    const funnelCounts: Record<string, number> = {};
    for (const stage of funnelStages) {
      funnelCounts[stage] = allApplications.filter((a) => a.status === stage).length;
    }

    // Recent activity feed
    const activityFeed: Array<{
      type: string;
      title: string;
      description: string;
      timestamp: string;
    }> = [];

    for (const app of allApplications.slice(-10)) {
      activityFeed.push({
        type: 'application_submitted',
        title: 'New Application',
        description: `Application submitted for job #${app.jobId.slice(0, 8)}`,
        timestamp: app.appliedAt || new Date().toISOString(),
      });
    }

    for (const history of allStatusHistories.slice(-10)) {
      activityFeed.push({
        type: 'status_transition',
        title: `Application moved to ${history.newStatus}`,
        description: `Stage changed from ${history.previousStatus || 'none'} to ${history.newStatus}`,
        timestamp: history.createdAt,
      });
    }

    for (const job of allJobs.slice(-10)) {
      activityFeed.push({
        type: 'job_created',
        title: `Job Listing: ${job.title}`,
        description: `Status: ${job.status}, category: ${job.category || 'General'}`,
        timestamp: job.createdAt,
      });
    }

    activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      timeframes: {
        last24Hours: {
          signups: countSince(allUsers, oneDayAgo),
          jobsPosted: countSince(allJobs, oneDayAgo),
          applicationsSubmitted: countSince(allApplications, oneDayAgo),
          statusUpdates: countSince(allStatusHistories, oneDayAgo),
        },
        last7Days: {
          signups: countSince(allUsers, sevenDaysAgo),
          jobsPosted: countSince(allJobs, sevenDaysAgo),
          applicationsSubmitted: countSince(allApplications, sevenDaysAgo),
          statusUpdates: countSince(allStatusHistories, sevenDaysAgo),
        },
        last30Days: {
          signups: countSince(allUsers, thirtyDaysAgo),
          jobsPosted: countSince(allJobs, thirtyDaysAgo),
          applicationsSubmitted: countSince(allApplications, thirtyDaysAgo),
          statusUpdates: countSince(allStatusHistories, thirtyDaysAgo),
        },
        allTime: {
          totalUsers: allUsers.length,
          totalJobs: allJobs.length,
          totalApplications: allApplications.length,
          totalStatusUpdates: allStatusHistories.length,
        },
      },
      funnel: funnelCounts,
      activeApplicationsCount: allApplications.filter((a) => !['rejected', 'withdrawn', 'hired'].includes(a.status)).length,
      activityFeed: activityFeed.slice(0, 20),
    };
  }

  /**
   * Retrieve employment impact metrics: placements, fill rates, time-to-hire, category distribution, in-demand skills.
   */
  async getEmploymentImpactMetrics() {
    const [allApplications, allJobs, allProfiles, allStatusHistories, allEmployers] = await Promise.all([
      this.prisma.client.orm.public.JobApplication.all(),
      this.prisma.client.orm.public.Job.all(),
      this.prisma.client.orm.public.JobSeekerProfile.all(),
      this.prisma.client.orm.public.ApplicationStatusHistory.all(),
      this.prisma.client.orm.public.EmployerProfile.all(),
    ]);

    const hiredApplications = allApplications.filter((a) => a.status === 'hired');
    const totalApplications = allApplications.length;

    // Placement rate
    const placementRatePercent = totalApplications > 0
      ? Math.round((hiredApplications.length / totalApplications) * 10000) / 100
      : 0;

    // Jobs fill rate
    const hiredJobIds = new Set(hiredApplications.map((a) => a.jobId));
    const publishedOrClosedJobs = allJobs.filter((j) => ['published', 'closed'].includes(j.status));
    const jobFillRatePercent = publishedOrClosedJobs.length > 0
      ? Math.round((hiredJobIds.size / publishedOrClosedJobs.length) * 10000) / 100
      : 0;

    // Average time to hire (days)
    let totalDaysToHire = 0;
    let hiredCountWithDuration = 0;

    for (const app of hiredApplications) {
      const hiredEvent = allStatusHistories
        .filter((h) => h.applicationId === app.id && h.newStatus === 'hired')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

      const hiredDate = hiredEvent ? new Date(hiredEvent.createdAt) : new Date(app.updatedAt);
      const appliedDate = app.appliedAt ? new Date(app.appliedAt) : new Date(app.updatedAt);
      const diffMs = hiredDate.getTime() - appliedDate.getTime();
      const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      totalDaysToHire += diffDays;
      hiredCountWithDuration++;
    }

    const averageTimeToHireDays = hiredCountWithDuration > 0
      ? Math.round((totalDaysToHire / hiredCountWithDuration) * 10) / 10
      : 0;

    // Placements by job category
    const jobMap = new Map(allJobs.map((j) => [j.id, j]));
    const placementsByCategory: Record<string, number> = {};
    for (const app of hiredApplications) {
      const job = jobMap.get(app.jobId);
      const cat = job?.category || 'General';
      placementsByCategory[cat] = (placementsByCategory[cat] || 0) + 1;
    }

    // In-demand skills among hired jobs
    const skillCounts: Record<string, number> = {};
    for (const app of hiredApplications) {
      const job = jobMap.get(app.jobId);
      if (job?.skills && Array.isArray(job.skills)) {
        for (const skill of job.skills) {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        }
      }
    }

    const topInDemandSkills = Object.entries(skillCounts)
      .map(([skill, hiresCount]) => ({ skill, hiresCount }))
      .sort((a, b) => b.hiresCount - a.hiresCount)
      .slice(0, 10);

    // Active employers with at least one hire
    const employersWithHires = new Set<string>();
    for (const app of hiredApplications) {
      const job = jobMap.get(app.jobId);
      if (job?.employerId) {
        employersWithHires.add(job.employerId);
      }
    }

    return {
      totalPlacements: hiredApplications.length,
      totalApplications,
      placementRatePercent,
      jobFillRatePercent,
      averageTimeToHireDays,
      activeEmployersWithHires: employersWithHires.size,
      placementsByCategory,
      topInDemandSkills,
      availableJobSeekersCount: allProfiles.filter((p) => p.isAvailable).length,
      totalApprovedTalentCount: allProfiles.filter((p) => p.approvalStatus === 'approved').length,
    };
  }

  // ==========================================
  // OPERATIONAL REPORTS EXPORT
  // ==========================================

  /**
   * List available operational reports.
   */
  getAvailableReports() {
    return [
      {
        id: 'employment_impact',
        name: 'Employment Impact & Placements',
        description: 'Records of all candidate placements, hire dates, time-to-hire, and employer details.',
        formats: ['csv', 'json'],
        filters: ['startDate', 'endDate'],
      },
      {
        id: 'applications',
        name: 'Job Applications Pipeline',
        description: 'All applications with applicant details, status stages, and submission timestamps.',
        formats: ['csv', 'json'],
        filters: ['startDate', 'endDate', 'status'],
      },
      {
        id: 'jobs',
        name: 'Jobs & Vacancies Catalog',
        description: 'All published, draft, and closed jobs with applicant volume and compensation range.',
        formats: ['csv', 'json'],
        filters: ['startDate', 'endDate', 'status', 'category'],
      },
      {
        id: 'users',
        name: 'Platform Users & Accounts',
        description: 'Registered users with roles, account status, and suspension governance metadata.',
        formats: ['csv', 'json'],
        filters: ['startDate', 'endDate', 'status', 'role'],
      },
      {
        id: 'employers',
        name: 'Employer Verification & Onboarding',
        description: 'Employer profiles with verification status, company details, and job counts.',
        formats: ['csv', 'json'],
        filters: ['verificationStatus'],
      },
      {
        id: 'skills_demand',
        name: 'Skills Taxonomy & Talent Demand',
        description: 'Skills supply across candidate profiles versus demand in job postings.',
        formats: ['csv', 'json'],
        filters: ['category'],
      },
    ];
  }

  /**
   * Export selected operational report in CSV or JSON format.
   */
  async exportReport(
    type: string,
    format: 'csv' | 'json' = 'csv',
    filters?: { startDate?: string; endDate?: string; status?: string; role?: string; category?: string; verificationStatus?: string },
  ) {
    const start = filters?.startDate ? new Date(filters.startDate) : null;
    const end = filters?.endDate ? new Date(filters.endDate) : null;

    const isWithinDateRange = (dateStr?: string | null) => {
      if (!dateStr) return true;
      const d = new Date(dateStr);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    };

    let rows: Record<string, any>[] = [];

    switch (type.toLowerCase()) {
      case 'employment_impact':
      case 'placements': {
        const [applications, jobs, profiles, users, employers, statusHistories] = await Promise.all([
          this.prisma.client.orm.public.JobApplication.all(),
          this.prisma.client.orm.public.Job.all(),
          this.prisma.client.orm.public.JobSeekerProfile.all(),
          this.prisma.client.orm.public.User.all(),
          this.prisma.client.orm.public.EmployerProfile.all(),
          this.prisma.client.orm.public.ApplicationStatusHistory.all(),
        ]);

        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const profileMap = new Map(profiles.map((p) => [p.id, p]));
        const userMap = new Map(users.map((u) => [u.id, u]));
        const employerMap = new Map(employers.map((e) => [e.id, e]));

        const hired = applications.filter((a) => a.status === 'hired' && isWithinDateRange(a.appliedAt || a.updatedAt));

        rows = hired.map((app) => {
          const job = jobMap.get(app.jobId);
          const profile = profileMap.get(app.profileId);
          const user = profile ? userMap.get(profile.userId) : null;
          const employer = job ? employerMap.get(job.employerId) : null;

          const hiredHistory = statusHistories
            .filter((h) => h.applicationId === app.id && h.newStatus === 'hired')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

          const hiredAt = hiredHistory ? hiredHistory.createdAt : app.updatedAt;
          const appliedDate = app.appliedAt ? new Date(app.appliedAt) : new Date(app.updatedAt);
          const hiredDate = new Date(hiredAt);
          const diffDays = Math.max(0, Math.round((hiredDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)));

          return {
            applicationId: app.id,
            candidateName: user?.name || 'Anonymous',
            candidateEmail: user?.email || '',
            jobTitle: job?.title || 'Unknown Job',
            employerName: employer?.name || 'Unknown Employer',
            category: job?.category || 'General',
            workplaceType: job?.workplaceType || 'on_site',
            employmentType: job?.employmentType || 'full_time',
            appliedAt: app.appliedAt || '',
            hiredAt,
            daysToHire: diffDays,
            salaryCurrency: job?.salaryCurrency || 'USD',
            salaryMin: job?.salaryMin ?? '',
            salaryMax: job?.salaryMax ?? '',
          };
        });
        break;
      }

      case 'applications': {
        const [applications, jobs, profiles, users, employers] = await Promise.all([
          this.prisma.client.orm.public.JobApplication.all(),
          this.prisma.client.orm.public.Job.all(),
          this.prisma.client.orm.public.JobSeekerProfile.all(),
          this.prisma.client.orm.public.User.all(),
          this.prisma.client.orm.public.EmployerProfile.all(),
        ]);

        const jobMap = new Map(jobs.map((j) => [j.id, j]));
        const profileMap = new Map(profiles.map((p) => [p.id, p]));
        const userMap = new Map(users.map((u) => [u.id, u]));
        const employerMap = new Map(employers.map((e) => [e.id, e]));

        const filtered = applications.filter((app) => {
          if (filters?.status && app.status !== filters.status) return false;
          return isWithinDateRange(app.appliedAt || app.updatedAt);
        });

        rows = filtered.map((app) => {
          const job = jobMap.get(app.jobId);
          const profile = profileMap.get(app.profileId);
          const user = profile ? userMap.get(profile.userId) : null;
          const employer = job ? employerMap.get(job.employerId) : null;

          return {
            applicationId: app.id,
            jobId: app.jobId,
            jobTitle: job?.title || 'Unknown Job',
            employerName: employer?.name || 'Unknown Employer',
            candidateName: user?.name || 'Candidate',
            candidateEmail: user?.email || '',
            status: app.status,
            appliedAt: app.appliedAt || '',
            updatedAt: app.updatedAt || '',
            hasCoverLetter: Boolean(app.coverLetter),
            hasCvUrl: Boolean(app.cvUrl),
          };
        });
        break;
      }

      case 'jobs': {
        const [jobs, employers, applications] = await Promise.all([
          this.prisma.client.orm.public.Job.all(),
          this.prisma.client.orm.public.EmployerProfile.all(),
          this.prisma.client.orm.public.JobApplication.all(),
        ]);

        const employerMap = new Map(employers.map((e) => [e.id, e]));
        const appCounts: Record<string, number> = {};
        for (const app of applications) {
          appCounts[app.jobId] = (appCounts[app.jobId] || 0) + 1;
        }

        const filtered = jobs.filter((job) => {
          if (filters?.status && job.status !== filters.status) return false;
          if (filters?.category && job.category !== filters.category) return false;
          return isWithinDateRange(job.createdAt);
        });

        rows = filtered.map((job) => {
          const employer = employerMap.get(job.employerId);
          return {
            jobId: job.id,
            title: job.title,
            employerName: employer?.name || 'Unknown Employer',
            category: job.category || 'General',
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
            location: job.location || '',
            salaryMin: job.salaryMin ?? '',
            salaryMax: job.salaryMax ?? '',
            currency: job.salaryCurrency || 'USD',
            status: job.status,
            applicantCount: appCounts[job.id] || 0,
            publishedAt: job.publishedAt || '',
            closedAt: job.closedAt || '',
            createdAt: job.createdAt,
          };
        });
        break;
      }

      case 'users': {
        const users = await this.prisma.client.orm.public.User.all();

        const filtered = users.filter((u) => {
          if (filters?.role && u.role !== filters.role) return false;
          if (filters?.status && u.status !== filters.status) return false;
          return isWithinDateRange(u.createdAt);
        });

        rows = filtered.map((u) => ({
          userId: u.id,
          name: u.name || '',
          email: u.email,
          role: u.role,
          status: u.status || 'active',
          suspendedAt: u.suspendedAt || '',
          suspensionReason: u.suspensionReason || '',
          createdAt: u.createdAt,
        }));
        break;
      }

      case 'employers': {
        const [employers, jobs] = await Promise.all([
          this.prisma.client.orm.public.EmployerProfile.all(),
          this.prisma.client.orm.public.Job.all(),
        ]);

        const jobCounts: Record<string, number> = {};
        for (const job of jobs) {
          jobCounts[job.employerId] = (jobCounts[job.employerId] || 0) + 1;
        }

        const filtered = employers.filter((e) => {
          if (filters?.verificationStatus && e.verificationStatus !== filters.verificationStatus) return false;
          return isWithinDateRange(e.createdAt);
        });

        rows = filtered.map((e) => ({
          employerId: e.id,
          companyName: e.name,
          industry: e.industry || '',
          companySize: e.companySize || '',
          website: e.websiteUrl || '',
          location: e.location || '',
          contactEmail: e.contactEmail || '',
          contactPhone: e.contactPhone || '',
          verificationStatus: e.verificationStatus,
          verifiedAt: e.verifiedAt || '',
          jobsCount: jobCounts[e.id] || 0,
          createdAt: e.createdAt,
        }));
        break;
      }

      case 'skills_demand': {
        const [skills, profileSkills, jobs] = await Promise.all([
          this.prisma.client.orm.public.Skill.all(),
          this.prisma.client.orm.public.ProfileSkill.all(),
          this.prisma.client.orm.public.Job.all(),
        ]);

        const talentSkillCounts: Record<string, number> = {};
        for (const ps of profileSkills) {
          talentSkillCounts[ps.skillId] = (talentSkillCounts[ps.skillId] || 0) + 1;
        }

        const jobSkillCounts: Record<string, number> = {};
        for (const job of jobs) {
          if (Array.isArray(job.skills)) {
            for (const skillName of job.skills) {
              const lower = skillName.toLowerCase();
              jobSkillCounts[lower] = (jobSkillCounts[lower] || 0) + 1;
            }
          }
        }

        const filtered = skills.filter((s) => {
          if (filters?.category && s.category !== filters.category) return false;
          return true;
        });

        rows = filtered.map((skill) => {
          const talentSupply = talentSkillCounts[skill.id] || 0;
          const jobDemand = jobSkillCounts[skill.name.toLowerCase()] || 0;
          const demandScore = jobDemand * 2 + talentSupply;

          return {
            skillId: skill.id,
            skillName: skill.name,
            category: skill.category || 'General',
            talentProfilesCount: talentSupply,
            jobRequirementsCount: jobDemand,
            demandScore,
          };
        });
        rows.sort((a, b) => b.demandScore - a.demandScore);
        break;
      }

      default:
        throw new BadRequestException(`Report type "${type}" is not recognized.`);
    }

    if (format === 'json') {
      return {
        format: 'json',
        reportType: type,
        generatedAt: new Date().toISOString(),
        totalRows: rows.length,
        filters: filters || {},
        data: rows,
      };
    }

    // CSV formatting
    const csvContent = this.formatCsv(rows);
    return {
      format: 'csv',
      filename: `fruitful-report-${type.toLowerCase()}-${Date.now()}.csv`,
      totalRows: rows.length,
      content: csvContent,
    };
  }

  private formatCsv(rows: Record<string, any>[]): string {
    if (rows.length === 0) {
      return '';
    }

    const headers = Object.keys(rows[0]);
    const escapeVal = (v: any) => {
      if (v === null || v === undefined) return '';
      const str = String(v).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headerRow = headers.map(escapeVal).join(',');
    const dataRows = rows.map((row) => headers.map((h) => escapeVal(row[h])).join(','));
    return [headerRow, ...dataRows].join('\r\n');
  }

  // ==========================================
  // CONTROLLED DATA & TAXONOMY DELEGATION
  // ==========================================

  async listCategories(query?: any) {
    return this.categoriesService.findAll(query);
  }

  async createCategory(dto: any) {
    return this.categoriesService.create(dto);
  }

  async updateCategory(id: string, dto: any) {
    return this.categoriesService.update(id, dto);
  }

  async deleteCategory(id: string) {
    return this.categoriesService.delete(id);
  }

  async seedCategories() {
    return this.categoriesService.seedDefaultCategories();
  }

  async listSkills(query?: any) {
    return this.skillsService.findAll(query);
  }

  async createSkill(dto: any) {
    return this.skillsService.create(dto);
  }

  async updateSkill(id: string, dto: any) {
    return this.skillsService.update(id, dto);
  }

  async deleteSkill(id: string) {
    return this.skillsService.delete(id);
  }

  async seedSkills() {
    return this.skillsService.seedStandardSkills();
  }

  async listControlledData(query?: any) {
    return this.controlledDataService.findAll(query);
  }

  async createControlledData(dto: any) {
    return this.controlledDataService.create(dto);
  }

  async updateControlledData(id: string, dto: any) {
    return this.controlledDataService.update(id, dto);
  }

  async deleteControlledData(id: string, force = false) {
    return this.controlledDataService.delete(id, force);
  }

  async seedControlledData() {
    return this.controlledDataService.seedStandardData();
  }

  // ==========================================
  // AUDIT LOGGING & TRACEABILITY
  // ==========================================

  /**
   * Produce an immutable audit log record for sensitive administrative actions.
   */
  async createAuditRecord(data: {
    adminId: string;
    adminEmail?: string;
    action: string;
    targetEntity: string;
    targetId: string;
    details?: any;
    ipAddress?: string;
  }) {
    try {
      const detailsStr = data.details
        ? typeof data.details === 'string'
          ? data.details
          : JSON.stringify(data.details)
        : null;

      const record = await this.prisma.client.orm.public.AuditLog.create({
        id: randomUUID(),
        adminId: data.adminId,
        adminEmail: data.adminEmail || null,
        action: data.action,
        targetEntity: data.targetEntity,
        targetId: data.targetId,
        details: detailsStr,
        ipAddress: data.ipAddress || null,
      });

      this.logger.log(`[AUDIT] Action: ${data.action} on ${data.targetEntity}#${data.targetId} by ${data.adminId}`);
      return record;
    } catch (err: any) {
      this.logger.error(`Failed to create audit log for ${data.action}: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * List audit logs with comprehensive filtering and pagination.
   */
  async listAuditLogs(query?: {
    action?: string;
    targetEntity?: string;
    targetId?: string;
    adminId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    let collection = this.prisma.client.orm.public.AuditLog;

    if (query?.action) {
      collection = collection.where((a) => a.action.eq(query.action!));
    }

    if (query?.targetEntity) {
      collection = collection.where((a) => a.targetEntity.eq(query.targetEntity!));
    }

    if (query?.targetId) {
      collection = collection.where((a) => a.targetId.eq(query.targetId!));
    }

    if (query?.adminId) {
      collection = collection.where((a) => a.adminId.eq(query.adminId!));
    }

    const allLogs = await collection
      .orderBy((a) => a.createdAt.desc())
      .all();

    const start = query?.startDate ? new Date(query.startDate) : null;
    const end = query?.endDate ? new Date(query.endDate) : null;

    let filtered = allLogs;
    if (start || end) {
      filtered = filtered.filter((log) => {
        const d = new Date(log.createdAt);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    const parsedLogs = paginated.map((log) => ({
      ...log,
      details: log.details ? this.safeParseJson(log.details) : null,
    }));

    return {
      count: parsedLogs.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs: parsedLogs,
    };
  }

  /**
   * Retrieve audit and verification history for a specific target entity.
   */
  async getEntityAuditTrail(targetEntity: string, targetId: string) {
    const logs = await this.prisma.client.orm.public.AuditLog
      .where((a) => a.targetEntity.eq(targetEntity))
      .where((a) => a.targetId.eq(targetId))
      .orderBy((a) => a.createdAt.desc())
      .all();

    return {
      targetEntity,
      targetId,
      totalActions: logs.length,
      trail: logs.map((log) => ({
        ...log,
        details: log.details ? this.safeParseJson(log.details) : null,
      })),
    };
  }

  /**
   * Helper to safely parse JSON strings without throwing.
   */
  private safeParseJson(jsonStr: string) {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return jsonStr;
    }
  }
}


