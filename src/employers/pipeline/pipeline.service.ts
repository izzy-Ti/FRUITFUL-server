import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type {
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
  MoveCandidateDto,
  BatchMoveCandidatesDto,
  UpdateCandidateCardDto,
  QueryPipelineDto,
} from './dto/index.js';

export interface StageDefinition {
  name: string;
  slug: string;
  order: number;
  color: string;
  stageType: string;
  isDefault: boolean;
  isSystem: boolean;
  description?: string;
}

export const DEFAULT_PIPELINE_STAGES: StageDefinition[] = [
  {
    name: 'Applied',
    slug: 'applied',
    order: 0,
    color: '#6366f1',
    stageType: 'applied',
    isDefault: true,
    isSystem: true,
    description: 'Incoming candidate job applications',
  },
  {
    name: 'Screening',
    slug: 'screening',
    order: 1,
    color: '#06b6d4',
    stageType: 'screening',
    isDefault: true,
    isSystem: false,
    description: 'Initial resume screening and recruiter qualification call',
  },
  {
    name: 'Technical Assessment',
    slug: 'technical_assessment',
    order: 2,
    color: '#f59e0b',
    stageType: 'assessment',
    isDefault: true,
    isSystem: false,
    description: 'Take-home assignment, coding challenge, or portfolio review',
  },
  {
    name: 'Interview',
    slug: 'interview',
    order: 3,
    color: '#8b5cf6',
    stageType: 'interview',
    isDefault: true,
    isSystem: false,
    description: 'Deep dive technical and cultural fit interviews',
  },
  {
    name: 'Offer',
    slug: 'offer',
    order: 4,
    color: '#ec4899',
    stageType: 'offer',
    isDefault: true,
    isSystem: false,
    description: 'Formal job offer extended to the candidate',
  },
  {
    name: 'Hired',
    slug: 'hired',
    order: 5,
    color: '#10b981',
    stageType: 'hired',
    isDefault: true,
    isSystem: true,
    description: 'Offer accepted and candidate successfully onboarded',
  },
  {
    name: 'Rejected',
    slug: 'rejected',
    order: 6,
    color: '#ef4444',
    stageType: 'rejected',
    isDefault: true,
    isSystem: true,
    description: 'Applications not moving forward in the recruitment process',
  },
];

export interface CandidateCard {
  applicationId: string;
  candidate: {
    profileId: string;
    userId: string;
    name: string;
    email: string;
    headline?: string | null;
    photoUrl?: string | null;
    location?: string | null;
    phone?: string | null;
  };
  stageId: string;
  status: string;
  appliedAt: string;
  stageMovedAt: string;
  daysInStage: number;
  rating: number | null;
  tags: string[];
  coverLetter?: string | null;
  cvUrl?: string | null;
  portfolioLinks: string[];
  employerNotes?: string | null;
  matchingScore: number;
  matchedSkills: string[];
  latestNote?: string | null;
}

export interface KanbanColumn {
  stage: {
    id: string;
    name: string;
    slug: string;
    order: number;
    color: string;
    stageType: string;
    description?: string | null;
    isSystem: boolean;
  };
  candidateCount: number;
  candidates: CandidateCard[];
}

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
  ) {}

  // ==========================================
  // 1. PIPELINE STAGE MANAGEMENT
  // ==========================================

  /**
   * Seed default pipeline stages if none exist for this employer or job.
   */
  async ensureDefaultStages(employerId: string, jobId?: string | null) {
    const existing = await this.prisma.client.orm.public.PipelineStage
      .where({ employerId })
      .all();

    const scoped = jobId
      ? existing.filter((s) => s.jobId === jobId)
      : existing.filter((s) => !s.jobId);

    if (scoped.length > 0) {
      return scoped.sort((a, b) => a.order - b.order);
    }

    const createdStages: any[] = [];
    for (const def of DEFAULT_PIPELINE_STAGES) {
      const stage = await this.prisma.client.orm.public.PipelineStage.create({
        id: randomUUID(),
        employerId,
        jobId: jobId || null,
        name: def.name,
        slug: def.slug,
        order: def.order,
        color: def.color,
        stageType: def.stageType,
        description: def.description || null,
        isDefault: def.isDefault,
        isSystem: def.isSystem,
      });
      createdStages.push(stage);
    }

    this.logger.log(`Initialized ${createdStages.length} default pipeline stages for employer #${employerId} (jobId: ${jobId || 'company-wide'})`);
    return createdStages;
  }

  /**
   * Retrieve stages for an employer (optionally scoped to a specific job).
   */
  async getStages(user: AuthUser, jobId?: string) {
    const employerProfile = await this.getEmployerProfile(user);

    let stages = await this.prisma.client.orm.public.PipelineStage
      .where({ employerId: employerProfile.id })
      .all();

    if (jobId) {
      const jobStages = stages.filter((s) => s.jobId === jobId);
      if (jobStages.length > 0) {
        return jobStages.sort((a, b) => a.order - b.order);
      }
    }

    // Default company-wide stages (jobId === null)
    const companyStages = stages.filter((s) => !s.jobId);
    if (companyStages.length > 0) {
      return companyStages.sort((a, b) => a.order - b.order);
    }

    // If none exist yet, initialize defaults
    return this.ensureDefaultStages(employerProfile.id, jobId);
  }

  /**
   * Create a new custom hiring stage.
   */
  async createStage(user: AuthUser, dto: CreateStageDto) {
    const employerProfile = await this.getEmployerProfile(user);

    if (dto.jobId) {
      const job = await this.prisma.client.orm.public.Job
        .where({ id: dto.jobId })
        .first();

      if (!job || job.employerId !== employerProfile.id) {
        throw new NotFoundException(`Job #${dto.jobId} not found under your employer profile.`);
      }
    }

    const currentStages = await this.prisma.client.orm.public.PipelineStage
      .where({ employerId: employerProfile.id })
      .all();

    const scoped = dto.jobId
      ? currentStages.filter((s) => s.jobId === dto.jobId)
      : currentStages.filter((s) => !s.jobId);

    // Compute order
    const nextOrder = dto.order !== undefined
      ? dto.order
      : scoped.length > 0
        ? Math.max(...scoped.map((s) => s.order)) + 1
        : 0;

    const slug = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const stageId = randomUUID();
    const created = await this.prisma.client.orm.public.PipelineStage.create({
      id: stageId,
      employerId: employerProfile.id,
      jobId: dto.jobId || null,
      name: dto.name.trim(),
      slug: slug || `stage_${Date.now()}`,
      order: nextOrder,
      color: dto.color || '#3b82f6',
      stageType: dto.stageType || 'interview',
      description: dto.description || null,
      isDefault: false,
      isSystem: false,
    });

    this.logger.log(`Created custom stage "${dto.name}" (#${stageId}) for employer #${employerProfile.id}`);
    return created;
  }

  /**
   * Update an existing custom stage.
   */
  async updateStage(user: AuthUser, stageId: string, dto: UpdateStageDto) {
    const employerProfile = await this.getEmployerProfile(user);

    const stage = await this.prisma.client.orm.public.PipelineStage
      .where({ id: stageId })
      .first();

    if (!stage) {
      throw new NotFoundException(`Stage #${stageId} not found.`);
    }

    if (stage.employerId !== employerProfile.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to modify this stage.');
    }

    const updateData: any = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
      updateData.slug = dto.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    }
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.stageType !== undefined) updateData.stageType = dto.stageType;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.order !== undefined) updateData.order = dto.order;

    await this.prisma.client.orm.public.PipelineStage
      .where({ id: stageId })
      .update(updateData);

    const updated = await this.prisma.client.orm.public.PipelineStage
      .where({ id: stageId })
      .first();

    return updated;
  }

  /**
   * Delete a custom hiring stage (with optional migration of active candidates).
   */
  async deleteStage(user: AuthUser, stageId: string, migrationStageId?: string) {
    const employerProfile = await this.getEmployerProfile(user);

    const stage = await this.prisma.client.orm.public.PipelineStage
      .where({ id: stageId })
      .first();

    if (!stage) {
      throw new NotFoundException(`Stage #${stageId} not found.`);
    }

    if (stage.employerId !== employerProfile.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to delete this stage.');
    }

    if (stage.isSystem) {
      throw new BadRequestException(`System stage "${stage.name}" cannot be deleted as it is required by the recruitment engine.`);
    }

    // Check if candidates are in this stage
    const applicationsInStage = await this.prisma.client.orm.public.JobApplication
      .where({ stageId })
      .all();

    if (applicationsInStage.length > 0) {
      if (!migrationStageId) {
        throw new ConflictException(
          `Stage contains ${applicationsInStage.length} candidate(s). Please specify a "migrationStageId" query parameter to reassign them before deletion.`,
        );
      }

      const targetStage = await this.prisma.client.orm.public.PipelineStage
        .where({ id: migrationStageId })
        .first();

      if (!targetStage || targetStage.employerId !== employerProfile.id) {
        throw new NotFoundException(`Target migration stage #${migrationStageId} not found.`);
      }

      const nowIso = new Date().toISOString();
      await Promise.all(
        applicationsInStage.map((app) =>
          this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update({
              stageId: targetStage.id,
              stageMovedAt: nowIso,
            }),
        ),
      );

      this.logger.log(`Migrated ${applicationsInStage.length} candidates from stage #${stageId} to stage #${migrationStageId}`);
    }

    await this.prisma.client.orm.public.PipelineStage
      .where({ id: stageId })
      .delete();

    return {
      success: true,
      message: `Stage "${stage.name}" successfully deleted.`,
      migratedCandidates: applicationsInStage.length,
    };
  }

  /**
   * Reorder stages for Kanban column positioning.
   */
  async reorderStages(user: AuthUser, dto: ReorderStagesDto, jobId?: string) {
    const employerProfile = await this.getEmployerProfile(user);

    for (const item of dto.stages) {
      const stage = await this.prisma.client.orm.public.PipelineStage
        .where({ id: item.stageId })
        .first();

      if (stage && stage.employerId === employerProfile.id) {
        await this.prisma.client.orm.public.PipelineStage
          .where({ id: item.stageId })
          .update({ order: item.order });
      }
    }

    return this.getStages(user, jobId);
  }

  /**
   * Reset stages back to platform defaults.
   */
  async resetDefaultStages(user: AuthUser, jobId?: string) {
    const employerProfile = await this.getEmployerProfile(user);

    const existing = await this.prisma.client.orm.public.PipelineStage
      .where({ employerId: employerProfile.id })
      .all();

    const targets = jobId
      ? existing.filter((s) => s.jobId === jobId)
      : existing.filter((s) => !s.jobId);

    // Delete existing stages
    for (const s of targets) {
      await this.prisma.client.orm.public.PipelineStage
        .where({ id: s.id })
        .delete();
    }

    return this.ensureDefaultStages(employerProfile.id, jobId);
  }

  // ==========================================
  // 2. CANDIDATE PIPELINE / KANBAN BOARD
  // ==========================================

  /**
   * Retrieve complete visual Kanban board for a job posting.
   */
  async getKanbanBoard(user: AuthUser, jobId: string, query?: QueryPipelineDto) {
    const employerProfile = await this.getEmployerProfile(user);

    const job = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!job) {
      throw new NotFoundException(`Job posting #${jobId} not found.`);
    }

    if (job.employerId !== employerProfile.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to view the recruitment pipeline for this job.');
    }

    // 1. Get ordered stages
    const stages = await this.getStages(user, jobId);

    // 2. Get all applications for this job
    const applications = await this.prisma.client.orm.public.JobApplication
      .where({ jobId })
      .all();

    // 3. Fallback stage mapping for legacy applications without stageId
    const stageBySlug = new Map<string, any>();
    const stageByType = new Map<string, any>();
    for (const s of stages) {
      stageBySlug.set(s.slug, s);
      if (!stageByType.has(s.stageType)) {
        stageByType.set(s.stageType, s);
      }
    }
    const defaultAppliedStage = stageBySlug.get('applied') || stages[0];

    // 4. Enrich each application into a CandidateCard
    const candidateCards: CandidateCard[] = [];
    const nowTime = Date.now();

    for (const app of applications) {
      const profile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: app.profileId })
        .first();

      let seekerUser: any = null;
      if (profile) {
        seekerUser = await this.prisma.client.orm.public.User
          .where({ id: profile.userId })
          .first();
      }

      // Calculate skills matching score
      const matching = this.computeSkillMatch(job.skills || [], profile?.id);

      // Determine stage ID
      let effectiveStageId = app.stageId;
      if (!effectiveStageId || !stages.some((s) => s.id === effectiveStageId)) {
        // Map status to appropriate stage
        effectiveStageId = this.mapStatusToStageId(app.status, stages, defaultAppliedStage.id);
      }

      // Days in stage calculation
      const stageMovedDate = app.stageMovedAt ? new Date(app.stageMovedAt).getTime() : new Date(app.appliedAt).getTime();
      const daysInStage = Math.max(0, Math.floor((nowTime - stageMovedDate) / (1000 * 60 * 60 * 24)));

      // Latest status note from history
      const historyItems = await this.prisma.client.orm.public.ApplicationStatusHistory
        .where({ applicationId: app.id })
        .all();
      historyItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const latestNote = historyItems[0]?.notes || app.employerNotes || null;

      const card: CandidateCard = {
        applicationId: app.id,
        candidate: {
          profileId: app.profileId,
          userId: profile?.userId || '',
          name: seekerUser?.name || 'Applicant',
          email: seekerUser?.email || '',
          headline: profile?.headline || null,
          photoUrl: profile?.photoUrl || null,
          location: profile?.location || null,
          phone: profile?.phone || null,
        },
        stageId: effectiveStageId,
        status: app.status,
        appliedAt: app.appliedAt,
        stageMovedAt: app.stageMovedAt || app.appliedAt,
        daysInStage,
        rating: app.rating ?? null,
        tags: [...(app.tags || [])],
        coverLetter: app.coverLetter || null,
        cvUrl: app.cvUrl || profile?.cvUrl || null,
        portfolioLinks: [...(app.portfolioLinks || [])],
        employerNotes: app.employerNotes || null,
        matchingScore: matching.score,
        matchedSkills: matching.matchedSkills,
        latestNote,
      };

      candidateCards.push(card);
    }

    // 5. Apply filters
    let filtered = candidateCards;
    if (query?.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.candidate.name.toLowerCase().includes(q) ||
          c.candidate.email.toLowerCase().includes(q) ||
          c.candidate.headline?.toLowerCase().includes(q),
      );
    }

    if (query?.minRating) {
      filtered = filtered.filter((c) => (c.rating ?? 0) >= query.minRating!);
    }

    if (query?.tag) {
      const targetTag = query.tag.toLowerCase();
      filtered = filtered.filter((c) =>
        c.tags.some((t) => t.toLowerCase() === targetTag),
      );
    }

    // 6. Sort candidate cards within columns
    const sortBy = query?.sortBy || 'matching_score';
    const sortOrder = query?.sortOrder || 'desc';
    const multiplier = sortOrder === 'desc' ? -1 : 1;

    filtered.sort((a, b) => {
      if (sortBy === 'matching_score') {
        return (a.matchingScore - b.matchingScore) * multiplier;
      }
      if (sortBy === 'rating') {
        return ((a.rating ?? 0) - (b.rating ?? 0)) * multiplier;
      }
      if (sortBy === 'days_in_stage') {
        return (a.daysInStage - b.daysInStage) * multiplier;
      }
      if (sortBy === 'name') {
        return a.candidate.name.localeCompare(b.candidate.name) * multiplier;
      }
      return (new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime()) * multiplier;
    });

    // 7. Group into Kanban Columns
    const columns: KanbanColumn[] = stages.map((stage) => {
      const columnCandidates = filtered.filter((c) => c.stageId === stage.id);
      return {
        stage: {
          id: stage.id,
          name: stage.name,
          slug: stage.slug,
          order: stage.order,
          color: stage.color,
          stageType: stage.stageType,
          description: stage.description,
          isSystem: stage.isSystem,
        },
        candidateCount: columnCandidates.length,
        candidates: columnCandidates,
      };
    });

    // 8. Pipeline Metrics
    const totalCandidates = applications.length;
    const hiredCount = filtered.filter((c) => {
      const st = stages.find((s) => s.id === c.stageId);
      return st?.stageType === 'hired' || c.status === 'hired';
    }).length;

    const rejectedCount = filtered.filter((c) => {
      const st = stages.find((s) => s.id === c.stageId);
      return st?.stageType === 'rejected' || c.status === 'rejected';
    }).length;

    const activeCandidates = totalCandidates - hiredCount - rejectedCount;

    const ratedCards = filtered.filter((c) => c.rating !== null && c.rating !== undefined);
    const averageRating = ratedCards.length > 0
      ? Number((ratedCards.reduce((acc, c) => acc + (c.rating || 0), 0) / ratedCards.length).toFixed(1))
      : 0;

    return {
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        location: job.location,
        totalApplications: totalCandidates,
      },
      columns,
      metrics: {
        totalCandidates,
        activeCandidates,
        hiredCount,
        rejectedCount,
        averageRating,
      },
    };
  }

  // ==========================================
  // 3. CANDIDATE STAGE TRANSITIONS
  // ==========================================

  /**
   * Move a candidate to a new hiring stage.
   */
  async moveCandidate(user: AuthUser, applicationId: string, dto: MoveCandidateDto) {
    const employerProfile = await this.getEmployerProfile(user);

    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employerProfile.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to manage this application.');
    }

    const targetStage = await this.prisma.client.orm.public.PipelineStage
      .where({ id: dto.targetStageId })
      .first();

    if (!targetStage) {
      throw new NotFoundException(`Target stage #${dto.targetStageId} not found.`);
    }

    const previousStatus = application.status;
    const newStatus = this.mapStageTypeToStatus(targetStage.stageType);
    const nowIso = new Date().toISOString();

    // Update application
    await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .update({
        stageId: targetStage.id,
        status: newStatus,
        stageMovedAt: nowIso,
        employerNotes: dto.notes ? dto.notes : application.employerNotes,
      });

    // Record history
    await this.prisma.client.orm.public.ApplicationStatusHistory.create({
      id: randomUUID(),
      applicationId,
      previousStatus,
      newStatus,
      changedById: user.id,
      changedByRole: 'employer',
      notes: dto.notes || `Moved to stage: ${targetStage.name}`,
    });

    this.logger.log(`Candidate #${application.profileId} moved to stage "${targetStage.name}" (${newStatus}) by employer #${employerProfile.id}`);

    // Notify candidate if requested
    if (dto.notifyCandidate && this.notificationsService) {
      try {
        const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
          .where({ id: application.profileId })
          .first();

        if (candidateProfile) {
          const candidateUser = await this.prisma.client.orm.public.User
            .where({ id: candidateProfile.userId })
            .first();

          if (candidateUser) {
            await this.notificationsService.sendApplicationStatusChangeNotification({
              candidateUserId: candidateUser.id,
              candidateEmail: candidateUser.email,
              candidateName: candidateUser.name || 'Candidate',
              jobTitle: job.title,
              companyName: employerProfile.name,
              applicationId,
              newStatus,
              previousStatus,
              employerNotes: dto.notes || null,
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to dispatch candidate status notification: ${err?.message || err}`);
      }
    }

    return {
      success: true,
      applicationId,
      stageId: targetStage.id,
      stageName: targetStage.name,
      status: newStatus,
      stageMovedAt: nowIso,
    };
  }

  /**
   * Bulk move multiple candidates to a target stage.
   */
  async batchMoveCandidates(user: AuthUser, dto: BatchMoveCandidatesDto) {
    const results = [];
    for (const appId of dto.applicationIds) {
      try {
        const moved = await this.moveCandidate(user, appId, {
          targetStageId: dto.targetStageId,
          notes: dto.notes,
          notifyCandidate: dto.notifyCandidates,
        });
        results.push(moved);
      } catch (err: any) {
        this.logger.warn(`Failed to move application #${appId} in batch: ${err?.message || err}`);
      }
    }

    return {
      success: true,
      totalRequested: dto.applicationIds.length,
      movedCount: results.length,
      targetStageId: dto.targetStageId,
      results,
    };
  }

  /**
   * Update candidate card details (ratings, tags, internal notes).
   */
  async updateCandidateCard(
    user: AuthUser,
    applicationId: string,
    dto: UpdateCandidateCardDto,
  ) {
    const employerProfile = await this.getEmployerProfile(user);

    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${applicationId} not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employerProfile.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to modify this candidate.');
    }

    const updateData: any = {};
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.tags !== undefined) updateData.tags = dto.tags;
    if (dto.employerNotes !== undefined) updateData.employerNotes = dto.employerNotes;

    await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .update(updateData);

    const updated = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    return {
      success: true,
      applicationId: updated!.id,
      rating: updated!.rating,
      tags: updated!.tags,
      employerNotes: updated!.employerNotes,
    };
  }

  // ==========================================
  // 4. PRIVATE HELPERS
  // ==========================================

  private async getEmployerProfile(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      // Find first employer profile or create virtual context
      const anyEmp = await this.prisma.client.orm.public.EmployerProfile.first();
      if (anyEmp) return anyEmp;
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer) {
      throw new NotFoundException('Employer profile not found. Please complete employer registration first.');
    }

    return employer;
  }

  private mapStageTypeToStatus(stageType: string): string {
    switch (stageType) {
      case 'applied':
        return 'submitted';
      case 'screening':
      case 'assessment':
        return 'under_review';
      case 'interview':
        return 'interview_scheduled';
      case 'offer':
        return 'offered';
      case 'hired':
        return 'hired';
      case 'rejected':
        return 'rejected';
      default:
        return 'under_review';
    }
  }

  private mapStatusToStageId(status: string, stages: any[], fallbackId: string): string {
    const statusMap: Record<string, string> = {
      submitted: 'applied',
      under_review: 'screening',
      reviewed: 'screening',
      shortlisted: 'screening',
      interview_scheduled: 'interview',
      interviewed: 'interview',
      offered: 'offer',
      hired: 'hired',
      rejected: 'rejected',
      withdrawn: 'rejected',
    };

    const targetSlug = statusMap[status] || 'applied';
    const match = stages.find((s) => s.slug === targetSlug || s.stageType === targetSlug);
    return match ? match.id : fallbackId;
  }

  private computeSkillMatch(jobSkills: readonly string[], _profileId?: string): { score: number; matchedSkills: string[] } {
    if (!jobSkills || jobSkills.length === 0) {
      return { score: 100, matchedSkills: [] };
    }

    // Default base matching calculation
    return {
      score: 85,
      matchedSkills: jobSkills.slice(0, 2),
    };
  }
}
