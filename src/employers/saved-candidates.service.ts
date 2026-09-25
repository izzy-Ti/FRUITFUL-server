import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { SaveCandidateDto } from './dto/save-candidate.dto.js';
import { UpdateSavedCandidateDto, QuerySavedCandidatesDto } from './dto/saved-candidates.dto.js';

@Injectable()
export class SavedCandidatesService {
  private readonly logger = new Logger(SavedCandidatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // HELPERS
  // =========================================================================

  private async getEmployerProfile(userId: string) {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();
    if (!profile) {
      throw new NotFoundException('Employer profile not found.');
    }
    return profile;
  }

  // =========================================================================
  // SAVE A CANDIDATE
  // =========================================================================

  async saveCandidate(userId: string, dto: SaveCandidateDto) {
    const employer = await this.getEmployerProfile(userId);

    // Confirm the profile exists and is approved
    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: dto.profileId })
      .first();
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found.');
    }

    // Check for duplicate
    const existing = await this.prisma.client.orm.public.SavedCandidate
      .where({ employerId: employer.id })
      .where((sc) => sc.profileId.eq(dto.profileId))
      .first();
    if (existing) {
      throw new ConflictException('Candidate already saved.');
    }

    const saved = await this.prisma.client.orm.public.SavedCandidate.create({
      id: randomUUID(),
      employerId: employer.id,
      profileId: dto.profileId,
      notes: dto.notes ?? null,
      tags: dto.tags ?? [],
    });

    this.logger.log(`Employer ${employer.id} saved candidate ${dto.profileId}.`);
    return saved;
  }

  // =========================================================================
  // LIST SAVED CANDIDATES
  // =========================================================================

  async findAll(userId: string, query: QuerySavedCandidatesDto) {
    const employer = await this.getEmployerProfile(userId);
    const { tag, page = 1, limit = 20 } = query;

    let collection = this.prisma.client.orm.public.SavedCandidate.where({
      employerId: employer.id,
    });

    const all = await collection.orderBy((sc) => sc.createdAt.desc()).all();

    // In-memory tag filter (tags is an array column)
    const filtered = tag
      ? all.filter((sc) => sc.tags.includes(tag))
      : all;

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    // Enrich with profile summaries
    const enriched = await Promise.all(
      paginated.map(async (sc) => {
        const profile = await this.prisma.client.orm.public.JobSeekerProfile
          .where({ id: sc.profileId })
          .first();
        const user = profile
          ? await this.prisma.client.orm.public.User.where({ id: profile.userId }).first()
          : null;

        return {
          ...sc,
          profile: profile
            ? {
                id: profile.id,
                headline: profile.headline,
                location: profile.location,
                photoUrl: profile.photoUrl,
                isAvailable: profile.isAvailable,
                approvalStatus: profile.approvalStatus,
                user: user ? { id: user.id, name: user.name, email: user.email } : null,
              }
            : null,
        };
      }),
    );

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // GET ONE
  // =========================================================================

  async findOne(userId: string, savedCandidateId: string) {
    const employer = await this.getEmployerProfile(userId);

    const sc = await this.prisma.client.orm.public.SavedCandidate.first({
      id: savedCandidateId,
    });
    if (!sc) {
      throw new NotFoundException('Saved candidate not found.');
    }
    if (sc.employerId !== employer.id) {
      throw new ForbiddenException('Access denied.');
    }

    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: sc.profileId })
      .first();
    const user = profile
      ? await this.prisma.client.orm.public.User.where({ id: profile.userId }).first()
      : null;

    return {
      ...sc,
      profile: profile
        ? {
            id: profile.id,
            headline: profile.headline,
            location: profile.location,
            photoUrl: profile.photoUrl,
            isAvailable: profile.isAvailable,
            approvalStatus: profile.approvalStatus,
            user: user ? { id: user.id, name: user.name, email: user.email } : null,
          }
        : null,
    };
  }

  // =========================================================================
  // UPDATE NOTES / TAGS
  // =========================================================================

  async update(userId: string, savedCandidateId: string, dto: UpdateSavedCandidateDto) {
    const employer = await this.getEmployerProfile(userId);

    const sc = await this.prisma.client.orm.public.SavedCandidate.first({
      id: savedCandidateId,
    });
    if (!sc) {
      throw new NotFoundException('Saved candidate not found.');
    }
    if (sc.employerId !== employer.id) {
      throw new ForbiddenException('Access denied.');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.notes !== undefined) updateData['notes'] = dto.notes;
    if (dto.tags !== undefined) updateData['tags'] = dto.tags;

    const updated = await this.prisma.client.orm.public.SavedCandidate
      .where({ id: savedCandidateId })
      .update(updateData);

    return updated;
  }

  // =========================================================================
  // REMOVE
  // =========================================================================

  async remove(userId: string, savedCandidateId: string) {
    const employer = await this.getEmployerProfile(userId);

    const sc = await this.prisma.client.orm.public.SavedCandidate.first({
      id: savedCandidateId,
    });
    if (!sc) {
      throw new NotFoundException('Saved candidate not found.');
    }
    if (sc.employerId !== employer.id) {
      throw new ForbiddenException('Access denied.');
    }

    await this.prisma.client.orm.public.SavedCandidate
      .where({ id: savedCandidateId })
      .delete();

    this.logger.log(`Employer ${employer.id} removed saved candidate ${savedCandidateId}.`);
    return { message: 'Candidate removed from saved list.' };
  }

  // =========================================================================
  // UNSAVE BY PROFILE ID (convenience)
  // =========================================================================

  async removeByProfileId(userId: string, profileId: string) {
    const employer = await this.getEmployerProfile(userId);

    const sc = await this.prisma.client.orm.public.SavedCandidate
      .where({ employerId: employer.id })
      .where((s) => s.profileId.eq(profileId))
      .first();
    if (!sc) {
      throw new NotFoundException('Saved candidate not found.');
    }

    await this.prisma.client.orm.public.SavedCandidate.where({ id: sc.id }).delete();
    return { message: 'Candidate removed from saved list.' };
  }

  // =========================================================================
  // CHECK IF SAVED (for talent directory enrichment)
  // =========================================================================

  async isSaved(employerId: string, profileId: string): Promise<boolean> {
    const existing = await this.prisma.client.orm.public.SavedCandidate
      .where({ employerId })
      .where((sc) => sc.profileId.eq(profileId))
      .first();
    return Boolean(existing);
  }
}
