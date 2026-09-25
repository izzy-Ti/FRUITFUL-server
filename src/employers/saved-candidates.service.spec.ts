import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SavedCandidatesService } from './saved-candidates.service.js';

describe('SavedCandidatesService', () => {
  let service: SavedCandidatesService;
  let mockPrisma: any;

  const employerUserId = 'user-employer';
  const otherUserId = 'user-other';

  const mockEmployer = { id: 'employer-1', userId: employerUserId, name: 'Acme Corp' };
  const mockProfile = { id: 'profile-1', userId: 'user-seeker', headline: 'React Developer', approvalStatus: 'approved', visibility: 'public', isAvailable: true, location: null };
  const mockUser = { id: 'user-seeker', name: 'Jane Doe', email: 'jane@example.com' };

  const mockSC = {
    id: 'sc-1',
    employerId: 'employer-1',
    profileId: 'profile-1',
    notes: 'Great candidate',
    tags: ['shortlist'],
    createdAt: new Date().toISOString(),
  };

  const createChain = (items: any[], single: any = null) => {
    const chain: any = {};
    chain.where = vi.fn().mockImplementation(() => chain);
    chain.orderBy = vi.fn().mockImplementation(() => chain);
    chain.limit = vi.fn().mockImplementation(() => chain);
    chain.all = vi.fn().mockResolvedValue(items);
    chain.first = vi.fn().mockImplementation((pk?: any) => {
      if (pk?.id) {
        return Promise.resolve(items.find((i) => i.id === pk.id) ?? null);
      }
      return Promise.resolve(single ?? (items[0] ?? null));
    });
    chain.update = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...(single ?? items[0]), ...data }),
    );
    chain.delete = vi.fn().mockResolvedValue({});
    chain.create = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...data, createdAt: new Date().toISOString() }),
    );
    return chain;
  };

  beforeEach(() => {
    const employerChain = createChain([mockEmployer], mockEmployer);
    const profileChain = createChain([mockProfile], mockProfile);
    const userChain = createChain([mockUser], mockUser);
    const scChain = createChain([mockSC], mockSC);

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: employerChain,
            JobSeekerProfile: profileChain,
            User: userChain,
            SavedCandidate: scChain,
          },
        },
      },
    };

    service = new SavedCandidatesService(mockPrisma as any);
  });

  // =========================================================================
  // saveCandidate
  // =========================================================================

  describe('saveCandidate', () => {
    it('should save a candidate and return the record', async () => {
      // No existing saved candidate
      mockPrisma.client.orm.public.SavedCandidate.first.mockResolvedValueOnce(null);

      const result = await service.saveCandidate(employerUserId, {
        profileId: 'profile-1',
        notes: 'Great candidate',
        tags: ['shortlist'],
      });

      expect(mockPrisma.client.orm.public.SavedCandidate.create).toHaveBeenCalledWith(
        expect.objectContaining({ employerId: 'employer-1', profileId: 'profile-1' }),
      );
      expect(result).toBeDefined();
    });

    it('should throw ConflictException if already saved', async () => {
      // Existing found — not null
      mockPrisma.client.orm.public.SavedCandidate.first.mockResolvedValueOnce(mockSC);

      await expect(
        service.saveCandidate(employerUserId, { profileId: 'profile-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      mockPrisma.client.orm.public.JobSeekerProfile.first.mockResolvedValueOnce(null);

      await expect(
        service.saveCandidate(employerUserId, { profileId: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if employer profile not found', async () => {
      mockPrisma.client.orm.public.EmployerProfile.first.mockResolvedValueOnce(null);

      await expect(
        service.saveCandidate(employerUserId, { profileId: 'profile-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('should return paginated saved candidates enriched with profile info', async () => {
      const result = await service.findAll(employerUserId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.data[0].profile).toBeDefined();
    });

    it('should filter by tag', async () => {
      const tagged = { ...mockSC, tags: ['shortlist'] };
      const notTagged = { ...mockSC, id: 'sc-2', tags: ['archive'] };
      mockPrisma.client.orm.public.SavedCandidate.all.mockResolvedValueOnce([tagged, notTagged]);

      const result = await service.findAll(employerUserId, { tag: 'shortlist', page: 1, limit: 20 });

      expect(result.meta.total).toBe(1);
    });
  });

  // =========================================================================
  // findOne
  // =========================================================================

  describe('findOne', () => {
    it('should return a single saved candidate with profile', async () => {
      const result = await service.findOne(employerUserId, 'sc-1');
      expect(result.id).toBe('sc-1');
      expect(result.profile).toBeDefined();
    });

    it('should throw NotFoundException when record not found', async () => {
      mockPrisma.client.orm.public.SavedCandidate.first.mockResolvedValueOnce(null);
      await expect(service.findOne(employerUserId, 'sc-nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when record belongs to different employer', async () => {
      mockPrisma.client.orm.public.SavedCandidate.first
        .mockResolvedValueOnce({ ...mockSC, employerId: 'employer-other' });
      await expect(service.findOne(employerUserId, 'sc-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('should update notes and tags', async () => {
      const result = await service.update(employerUserId, 'sc-1', {
        notes: 'Updated note',
        tags: ['follow-up'],
      });
      expect(mockPrisma.client.orm.public.SavedCandidate.update).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Updated note', tags: ['follow-up'] }),
      );
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException for wrong employer', async () => {
      mockPrisma.client.orm.public.SavedCandidate.first
        .mockResolvedValueOnce({ ...mockSC, employerId: 'employer-other' });
      await expect(service.update(employerUserId, 'sc-1', { notes: 'x' })).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // remove
  // =========================================================================

  describe('remove', () => {
    it('should delete and return success message', async () => {
      const result = await service.remove(employerUserId, 'sc-1');
      expect(result.message).toContain('removed');
    });

    it('should throw ForbiddenException for wrong employer', async () => {
      mockPrisma.client.orm.public.SavedCandidate.first
        .mockResolvedValueOnce({ ...mockSC, employerId: 'employer-other' });
      await expect(service.remove(employerUserId, 'sc-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // isSaved
  // =========================================================================

  describe('isSaved', () => {
    it('should return true when saved', async () => {
      const result = await service.isSaved('employer-1', 'profile-1');
      expect(result).toBe(true);
    });

    it('should return false when not saved', async () => {
      mockPrisma.client.orm.public.SavedCandidate.first.mockResolvedValueOnce(null);
      const result = await service.isSaved('employer-1', 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
