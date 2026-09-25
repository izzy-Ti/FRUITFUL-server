import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import type {
  CreateCandidateNoteDto,
  UpdateCandidateNoteDto,
  QueryCandidateNotesDto,
} from './dto/index.js';

@Injectable()
export class CandidateNotesService {
  private readonly logger = new Logger(CandidateNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an evaluation or interview note for a candidate.
   */
  async createNote(user: AuthUser, dto: CreateCandidateNoteDto) {
    const employer = await this.getEmployerProfile(user);

    // Verify candidate profile exists
    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: dto.profileId })
      .first();

    if (!candidateProfile) {
      throw new NotFoundException(`Candidate profile #${dto.profileId} not found.`);
    }

    if (dto.applicationId) {
      const application = await this.prisma.client.orm.public.JobApplication
        .where({ id: dto.applicationId })
        .first();

      if (!application) {
        throw new NotFoundException(`Application #${dto.applicationId} not found.`);
      }
    }

    const noteId = randomUUID();
    const created = await this.prisma.client.orm.public.CandidateNote.create({
      id: noteId,
      employerId: employer.id,
      profileId: dto.profileId,
      applicationId: dto.applicationId || null,
      authorId: user.id,
      content: dto.content.trim(),
      category: dto.category || 'general',
      rating: dto.rating ?? null,
      isPinned: dto.isPinned ?? false,
    });

    this.logger.log(`Created candidate note #${noteId} on candidate #${dto.profileId} by user #${user.id}`);

    return {
      ...created,
      author: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * List all notes for a candidate profile written by this employer.
   */
  async listNotes(user: AuthUser, profileId: string, query?: QueryCandidateNotesDto) {
    const employer = await this.getEmployerProfile(user);

    let notes = await this.prisma.client.orm.public.CandidateNote
      .where({
        employerId: employer.id,
        profileId,
      })
      .all();

    if (query?.category) {
      notes = notes.filter((n) => n.category === query.category);
    }

    if (query?.applicationId) {
      notes = notes.filter((n) => n.applicationId === query.applicationId);
    }

    // Sort: pinned first, then newest first
    notes.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const enriched = await Promise.all(
      notes.map(async (n) => {
        const author = await this.prisma.client.orm.public.User
          .where({ id: n.authorId })
          .first();

        return {
          ...n,
          author: author
            ? {
                id: author.id,
                name: author.name,
                email: author.email,
                role: author.role,
              }
            : null,
        };
      }),
    );

    return {
      count: enriched.length,
      profileId,
      notes: enriched,
    };
  }

  /**
   * Retrieve single candidate note.
   */
  async getNoteById(user: AuthUser, noteId: string) {
    const employer = await this.getEmployerProfile(user);

    const note = await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .first();

    if (!note) {
      throw new NotFoundException(`Candidate note #${noteId} not found.`);
    }

    if (note.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to view this note.');
    }

    const author = await this.prisma.client.orm.public.User
      .where({ id: note.authorId })
      .first();

    return {
      ...note,
      author: author
        ? {
            id: author.id,
            name: author.name,
            email: author.email,
            role: author.role,
          }
        : null,
    };
  }

  /**
   * Update an existing candidate note.
   */
  async updateNote(user: AuthUser, noteId: string, dto: UpdateCandidateNoteDto) {
    const employer = await this.getEmployerProfile(user);

    const note = await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .first();

    if (!note) {
      throw new NotFoundException(`Candidate note #${noteId} not found.`);
    }

    if (note.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to update this note.');
    }

    // Only note author or admin can modify content
    if (note.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the author can edit this note.');
    }

    const updateData: any = {};
    if (dto.content !== undefined) updateData.content = dto.content.trim();
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.isPinned !== undefined) updateData.isPinned = dto.isPinned;

    await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .update(updateData);

    const updated = await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .first();

    return updated;
  }

  /**
   * Delete a candidate note.
   */
  async deleteNote(user: AuthUser, noteId: string) {
    const employer = await this.getEmployerProfile(user);

    const note = await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .first();

    if (!note) {
      throw new NotFoundException(`Candidate note #${noteId} not found.`);
    }

    if (note.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to delete this note.');
    }

    if (note.authorId !== user.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only the author or an administrator can delete this note.');
    }

    await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .delete();

    return {
      success: true,
      message: 'Candidate note deleted successfully.',
    };
  }

  /**
   * Toggle pinned status of a candidate note.
   */
  async togglePinNote(user: AuthUser, noteId: string) {
    const note = await this.getNoteById(user, noteId);

    await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .update({
        isPinned: !note.isPinned,
      });

    const updated = await this.prisma.client.orm.public.CandidateNote
      .where({ id: noteId })
      .first();

    return updated;
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
