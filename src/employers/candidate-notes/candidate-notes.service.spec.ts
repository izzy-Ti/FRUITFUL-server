import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CandidateNotesService } from './candidate-notes.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('CandidateNotesService', () => {
  let service: CandidateNotesService;
  let mockPrisma: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'hr@acme.com',
    name: 'Acme HR',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const otherEmployerUser: AuthUser = {
    id: 'user-other-emp',
    email: 'other@company.com',
    name: 'Other HR',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const adminUser: AuthUser = {
    id: 'user-admin',
    email: 'admin@fruitful.com',
    name: 'System Admin',
    role: Role.ADMIN,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployerProfile = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corp',
  };

  const mockCandidateProfile = {
    id: 'candidate-profile-1',
    userId: 'user-seeker-1',
    headline: 'Senior Full Stack Developer',
    location: 'Nairobi, Kenya',
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'candidate-profile-1',
    status: 'under_review',
  };

  const mockNote = {
    id: 'note-1',
    employerId: 'emp-profile-1',
    profileId: 'candidate-profile-1',
    applicationId: 'app-1',
    authorId: employerUser.id,
    content: 'Strong technical background with Node.js and PostgreSQL.',
    category: 'technical_interview',
    rating: 5,
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.userId === employerUser.id || filter.userId === 'colleague-user') {
                    return mockEmployerProfile;
                  }
                  return null;
                }),
              })),
              first: vi.fn().mockResolvedValue(mockEmployerProfile),
            },
            JobSeekerProfile: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockCandidateProfile.id) return mockCandidateProfile;
                  return null;
                }),
              })),
            },
            JobApplication: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockApplication.id) return mockApplication;
                  return null;
                }),
              })),
            },
            CandidateNote: {
              create: vi.fn().mockImplementation(async (data) => ({
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockNote.id) return { ...mockNote };
                  return null;
                }),
                all: vi.fn().mockResolvedValue([mockNote]),
                update: vi.fn().mockResolvedValue({ count: 1 }),
                delete: vi.fn().mockResolvedValue({ count: 1 }),
              })),
            },
            User: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === employerUser.id) return employerUser;
                  if (filter.id === adminUser.id) return adminUser;
                  return null;
                }),
              })),
            },
          },
        },
      },
    };

    service = new CandidateNotesService(mockPrisma);
  });

  describe('createNote', () => {
    it('should create candidate note successfully', async () => {
      const result = await service.createNote(employerUser, {
        profileId: 'candidate-profile-1',
        applicationId: 'app-1',
        content: 'Great candidate with excellent communication.',
        category: 'phone_screen',
        rating: 4,
        isPinned: true,
      });

      expect(result).toBeDefined();
      expect(result.content).toBe('Great candidate with excellent communication.');
      expect(result.author.id).toBe(employerUser.id);
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if candidate profile not found', async () => {
      await expect(
        service.createNote(employerUser, {
          profileId: 'non-existent-profile',
          content: 'Some note',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if applicationId provided but not found', async () => {
      await expect(
        service.createNote(employerUser, {
          profileId: 'candidate-profile-1',
          applicationId: 'non-existent-app',
          content: 'Some note',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listNotes', () => {
    it('should return notes enriched with author and ordered pinned first', async () => {
      const pinnedNote = {
        ...mockNote,
        id: 'note-pinned',
        isPinned: true,
        createdAt: '2026-09-01T10:00:00.000Z',
      };
      const unpinnedNote = {
        ...mockNote,
        id: 'note-unpinned',
        isPinned: false,
        createdAt: '2026-09-02T10:00:00.000Z',
      };

      mockPrisma.client.orm.public.CandidateNote.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([unpinnedNote, pinnedNote]),
      });

      const res = await service.listNotes(employerUser, 'candidate-profile-1');
      expect(res.count).toBe(2);
      expect(res.notes[0].id).toBe('note-pinned');
      expect(res.notes[0].author).toBeDefined();
      expect(res.notes[0].author?.name).toBe('Acme HR');
    });

    it('should filter notes by category and applicationId', async () => {
      const note1 = { ...mockNote, category: 'technical_interview', applicationId: 'app-1' };
      const note2 = { ...mockNote, id: 'note-2', category: 'general', applicationId: 'app-2' };

      mockPrisma.client.orm.public.CandidateNote.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([note1, note2]),
      });

      const res = await service.listNotes(employerUser, 'candidate-profile-1', {
        category: 'technical_interview',
        applicationId: 'app-1',
      });

      expect(res.count).toBe(1);
      expect(res.notes[0].category).toBe('technical_interview');
    });
  });

  describe('getNoteById', () => {
    it('should retrieve note by id with author', async () => {
      const res = await service.getNoteById(employerUser, 'note-1');
      expect(res.id).toBe('note-1');
      expect(res.author?.id).toBe(employerUser.id);
    });

    it('should throw NotFoundException if note does not exist', async () => {
      await expect(service.getNoteById(employerUser, 'missing-note')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if note belongs to another employer', async () => {
      mockPrisma.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'emp-profile-2', userId: otherEmployerUser.id }),
      });

      await expect(service.getNoteById(otherEmployerUser, 'note-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateNote', () => {
    it('should allow author to update content, rating, and pinned status', async () => {
      const updated = await service.updateNote(employerUser, 'note-1', {
        content: 'Updated feedback',
        rating: 4,
        isPinned: true,
      });

      expect(mockPrisma.client.orm.public.CandidateNote.where).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if non-author tries to update note', async () => {
      await expect(
        service.updateNote(
          { ...employerUser, id: 'colleague-user' },
          'note-1',
          { content: 'Hacked note' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update note even if not original author', async () => {
      await expect(
        service.updateNote(adminUser, 'note-1', { content: 'Admin updated note' }),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteNote', () => {
    it('should allow author to delete candidate note', async () => {
      const res = await service.deleteNote(employerUser, 'note-1');
      expect(res.success).toBe(true);
    });

    it('should throw ForbiddenException if non-author attempts delete', async () => {
      await expect(
        service.deleteNote({ ...employerUser, id: 'colleague-user' }, 'note-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to delete candidate note', async () => {
      const res = await service.deleteNote(adminUser, 'note-1');
      expect(res.success).toBe(true);
    });
  });

  describe('togglePinNote', () => {
    it('should toggle pinned status from false to true', async () => {
      await service.togglePinNote(employerUser, 'note-1');
      expect(mockPrisma.client.orm.public.CandidateNote.where).toHaveBeenCalled();
    });
  });
});
