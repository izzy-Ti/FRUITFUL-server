import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
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

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly employersService: EmployersService,
    private readonly jobsService: JobsService,
    private readonly jobSeekersService: JobSeekersService,
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
   * Verify or reject an employer organization.
   */
  async verifyEmployer(
    adminUserId: string,
    employerId: string,
    status: 'verified' | 'rejected',
    rejectionReason?: string,
  ) {
    return this.employersService.updateVerificationStatus(
      employerId,
      { status, rejectionReason },
      adminUserId,
    );
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

    return this.jobsService.getJobById(jobId);
  }

  /**
   * Remove a job listing permanently.
   */
  async removeJob(adminUserId: string, jobId: string) {
    return this.jobsService.deleteJob(adminUserId, jobId, true);
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
    return this.jobSeekersService.moderateTalentProfile(adminUserId, profileId, dto);
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
}
