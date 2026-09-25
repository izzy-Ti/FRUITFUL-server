import {
  Injectable,
  Logger,
  NotFoundException,
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
import type { BulkCandidateActionDto } from './dto/index.js';

export interface BulkActionResult {
  success: boolean;
  action: string;
  totalRequested: number;
  processedCount: number;
  failedCount: number;
  results: any[];
  exportData?: any[];
  csvContent?: string;
}

@Injectable()
export class BulkActionsService {
  private readonly logger = new Logger(BulkActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Execute bulk action across multiple candidate applications.
   */
  async executeBulkAction(
    user: AuthUser,
    dto: BulkCandidateActionDto,
  ): Promise<BulkActionResult> {
    const employer = await this.getEmployerProfile(user);
    const nowIso = new Date().toISOString();

    // 1. Load and verify ownership of applications
    const applications: any[] = [];
    for (const id of dto.applicationIds) {
      const app = await this.prisma.client.orm.public.JobApplication
        .where({ id })
        .first();

      if (app) {
        const job = await this.prisma.client.orm.public.Job
          .where({ id: app.jobId })
          .first();

        if (job && (job.employerId === employer.id || user.role === Role.ADMIN)) {
          applications.push({ ...app, jobTitle: job.title });
        }
      }
    }

    if (applications.length === 0) {
      throw new NotFoundException('None of the specified applications were found under your employer profile.');
    }

    const results: any[] = [];

    switch (dto.action) {
      // ------------------------------------------
      // 1. BULK STATUS / STAGE UPDATE
      // ------------------------------------------
      case 'status_update': {
        const newStatus = dto.status || 'under_review';

        for (const app of applications) {
          const updateData: any = {
            status: newStatus,
            stageMovedAt: nowIso,
          };
          if (dto.stageId) updateData.stageId = dto.stageId;
          if (dto.notes) updateData.employerNotes = dto.notes;

          await this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update(updateData);

          await this.prisma.client.orm.public.ApplicationStatusHistory.create({
            id: randomUUID(),
            applicationId: app.id,
            previousStatus: app.status,
            newStatus,
            changedById: user.id,
            changedByRole: 'employer',
            notes: dto.notes || `Bulk status update to: ${newStatus}`,
          });

          if (dto.notifyCandidates && this.notificationsService) {
            await this.notifyCandidateStatusChange(app, newStatus, dto.notes);
          }

          results.push({ applicationId: app.id, status: newStatus, success: true });
        }
        break;
      }

      // ------------------------------------------
      // 2. BULK REJECT
      // ------------------------------------------
      case 'reject': {
        for (const app of applications) {
          await this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update({
              status: 'rejected',
              stageMovedAt: nowIso,
              employerNotes: dto.rejectionReason || app.employerNotes,
            });

          await this.prisma.client.orm.public.ApplicationStatusHistory.create({
            id: randomUUID(),
            applicationId: app.id,
            previousStatus: app.status,
            newStatus: 'rejected',
            changedById: user.id,
            changedByRole: 'employer',
            notes: dto.rejectionReason || 'Bulk rejection',
          });

          if (dto.notifyCandidates && this.notificationsService) {
            await this.notifyCandidateStatusChange(app, 'rejected', dto.rejectionReason);
          }

          results.push({ applicationId: app.id, status: 'rejected', success: true });
        }
        break;
      }

      // ------------------------------------------
      // 3. BULK ADD TAGS
      // ------------------------------------------
      case 'add_tags': {
        if (!dto.tags || dto.tags.length === 0) {
          throw new BadRequestException('tags array must contain at least one tag to add.');
        }

        for (const app of applications) {
          const currentTags = new Set<string>((app.tags as string[]) || []);
          dto.tags.forEach((t) => currentTags.add(t.toLowerCase().trim()));
          const updatedTags: string[] = Array.from(currentTags);

          await this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update({ tags: updatedTags });

          results.push({ applicationId: app.id, tags: updatedTags, success: true });
        }
        break;
      }

      // ------------------------------------------
      // 4. BULK REMOVE TAGS
      // ------------------------------------------
      case 'remove_tags': {
        if (!dto.tags || dto.tags.length === 0) {
          throw new BadRequestException('tags array must contain at least one tag to remove.');
        }

        const tagsToRemove = new Set(dto.tags.map((t) => t.toLowerCase().trim()));

        for (const app of applications) {
          const updatedTags: string[] = ((app.tags as string[]) || []).filter((t: string) => !tagsToRemove.has(t.toLowerCase()));

          await this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update({ tags: updatedTags });

          results.push({ applicationId: app.id, tags: updatedTags, success: true });
        }
        break;
      }

      // ------------------------------------------
      // 5. BULK SET RATING
      // ------------------------------------------
      case 'set_rating': {
        if (dto.rating === undefined || dto.rating < 1 || dto.rating > 5) {
          throw new BadRequestException('rating must be an integer between 1 and 5.');
        }

        for (const app of applications) {
          await this.prisma.client.orm.public.JobApplication
            .where({ id: app.id })
            .update({ rating: dto.rating });

          results.push({ applicationId: app.id, rating: dto.rating, success: true });
        }
        break;
      }

      // ------------------------------------------
      // 6. BULK ADD NOTE
      // ------------------------------------------
      case 'add_note': {
        if (!dto.notes || dto.notes.trim().length === 0) {
          throw new BadRequestException('notes text is required for add_note action.');
        }

        for (const app of applications) {
          const noteId = randomUUID();
          await this.prisma.client.orm.public.CandidateNote.create({
            id: noteId,
            employerId: employer.id,
            profileId: app.profileId,
            applicationId: app.id,
            authorId: user.id,
            content: dto.notes.trim(),
            category: dto.noteCategory || 'general',
            rating: dto.rating ?? null,
            isPinned: false,
          });

          results.push({ applicationId: app.id, noteId, success: true });
        }
        break;
      }

      // ------------------------------------------
      // 7. BULK EXPORT
      // ------------------------------------------
      case 'export': {
        const exportRecords = [];
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

          let stageName = 'Default';
          if (app.stageId) {
            const st = await this.prisma.client.orm.public.PipelineStage
              .where({ id: app.stageId })
              .first();
            if (st) stageName = st.name;
          }

          exportRecords.push({
            applicationId: app.id,
            jobTitle: app.jobTitle,
            candidateName: seekerUser?.name || 'N/A',
            email: seekerUser?.email || 'N/A',
            phone: profile?.phone || 'N/A',
            location: profile?.location || 'N/A',
            headline: profile?.headline || 'N/A',
            status: app.status,
            stage: stageName,
            rating: app.rating ?? '',
            tags: (app.tags || []).join('; '),
            appliedAt: app.appliedAt,
            notes: app.employerNotes || '',
          });
        }

        const csvContent = this.generateCsv(exportRecords);

        this.logger.log(`Exported ${exportRecords.length} candidates for employer #${employer.id}`);
        return {
          success: true,
          action: 'export',
          totalRequested: dto.applicationIds.length,
          processedCount: exportRecords.length,
          failedCount: dto.applicationIds.length - exportRecords.length,
          results: exportRecords,
          exportData: exportRecords,
          csvContent,
        };
      }
    }

    this.logger.log(`Bulk action "${dto.action}" executed on ${results.length} applications by employer #${employer.id}`);

    return {
      success: true,
      action: dto.action,
      totalRequested: dto.applicationIds.length,
      processedCount: results.length,
      failedCount: dto.applicationIds.length - results.length,
      results,
    };
  }

  private async notifyCandidateStatusChange(app: any, newStatus: string, notes?: string) {
    try {
      const profile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: app.profileId })
        .first();

      if (profile) {
        const seekerUser = await this.prisma.client.orm.public.User
          .where({ id: profile.userId })
          .first();

        if (seekerUser && this.notificationsService) {
          await this.notificationsService.sendApplicationStatusChangeNotification({
            candidateUserId: seekerUser.id,
            candidateEmail: seekerUser.email,
            candidateName: seekerUser.name || 'Candidate',
            jobTitle: app.jobTitle,
            companyName: 'Fruitful Journey Employer',
            applicationId: app.id,
            newStatus,
            previousStatus: app.status,
            employerNotes: notes || null,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch candidate status notification in bulk action: ${err?.message || err}`);
    }
  }

  private generateCsv(records: any[]): string {
    if (!records || records.length === 0) return '';
    const headers = Object.keys(records[0]);
    const csvRows = [headers.join(',')];

    for (const record of records) {
      const row = headers.map((header) => {
        const val = record[header] ?? '';
        const escaped = String(val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
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
