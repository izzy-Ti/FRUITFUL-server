import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SavedSearchesService } from './saved-searches.service.js';
import { SavedSearchType, AlertFrequency } from './dto/create-saved-search.dto.js';

describe('SavedSearchesService', () => {
  let service: SavedSearchesService;
  let mockPrisma: any;

  const userId = 'user-abc';
  const otherId = 'user-other';

  const mockSaved = {
    id: 'search-1',
    userId,
    title: 'Remote React Jobs',
    type: SavedSearchType.JOB,
    filters: JSON.stringify({ search: 'react', workplaceType: 'remote' }),
    alertFrequency: AlertFrequency.DAILY,
    isActive: true,
    lastNotifiedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createMockChain = (defaultItem: any) => {
    const chain: any = {};
    chain.where = vi.fn().mockImplementation(() => chain);
    chain.orderBy = vi.fn().mockImplementation(() => chain);
    chain.limit = vi.fn().mockImplementation(() => chain);
    chain.offset = vi.fn().mockImplementation(() => chain);
    chain.all = vi.fn().mockResolvedValue(defaultItem ? [defaultItem] : []);
    chain.first = vi.fn().mockImplementation((pk?: any) => {
      if (pk && pk.id === 'search-1') return Promise.resolve(defaultItem);
      if (pk && pk.id !== 'search-1') return Promise.resolve(null);
      return Promise.resolve(defaultItem);
    });
    chain.update = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...defaultItem, ...data }),
    );
    chain.delete = vi.fn().mockResolvedValue({});
    chain.create = vi.fn().mockImplementation((data: any) =>
      Promise.resolve({ ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    );
    return chain;
  };

  beforeEach(() => {
    const savedSearchChain = createMockChain(mockSaved);
    savedSearchChain.asc = vi.fn().mockImplementation(() => savedSearchChain);
    savedSearchChain.desc = vi.fn().mockImplementation(() => savedSearchChain);

    mockPrisma = {
      client: {
        orm: {
          public: {
            SavedSearch: savedSearchChain,
          },
        },
      },
    };

    service = new SavedSearchesService(mockPrisma as any);
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('should create a saved search and return deserialized result', async () => {
      const dto = {
        title: 'Remote React Jobs',
        type: SavedSearchType.JOB,
        filters: { search: 'react', workplaceType: 'remote' },
        alertFrequency: AlertFrequency.DAILY,
        isActive: true,
      };

      const result = await service.create(userId, dto);

      expect(mockPrisma.client.orm.public.SavedSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: 'Remote React Jobs',
          type: SavedSearchType.JOB,
          filters: JSON.stringify({ search: 'react', workplaceType: 'remote' }),
          alertFrequency: AlertFrequency.DAILY,
          isActive: true,
        }),
      );
      expect(result.filters).toEqual({ search: 'react', workplaceType: 'remote' });
    });

    it('should default alertFrequency to daily if not provided', async () => {
      const dto = {
        title: 'Test',
        type: SavedSearchType.TALENT,
        filters: {},
      };

      await service.create(userId, dto as any);

      expect(mockPrisma.client.orm.public.SavedSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ alertFrequency: 'daily' }),
      );
    });
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('should return paginated saved searches for the user', async () => {
      const result = await service.findAll(userId, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.data[0].filters).toEqual({ search: 'react', workplaceType: 'remote' });
    });

    it('should apply type filter when provided', async () => {
      const chain = mockPrisma.client.orm.public.SavedSearch;
      await service.findAll(userId, { type: SavedSearchType.JOB, page: 1, limit: 20 });

      // Should have called .where() at least once for type filter
      expect(chain.where).toHaveBeenCalled();
    });

    it('should apply isActive filter when provided', async () => {
      const chain = mockPrisma.client.orm.public.SavedSearch;
      await service.findAll(userId, { isActive: true, page: 1, limit: 20 });

      expect(chain.where).toHaveBeenCalled();
    });

    it('should calculate correct pagination meta', async () => {
      // Return 25 items to test pagination
      const items = Array.from({ length: 25 }, (_, i) => ({ ...mockSaved, id: `s-${i}` }));
      mockPrisma.client.orm.public.SavedSearch.all.mockResolvedValueOnce(items);

      const result = await service.findAll(userId, { page: 2, limit: 10 });

      expect(result.meta.total).toBe(25);
      expect(result.meta.totalPages).toBe(3);
      expect(result.data).toHaveLength(10);
    });
  });

  // =========================================================================
  // findOne
  // =========================================================================

  describe('findOne', () => {
    it('should return a saved search belonging to the user', async () => {
      const result = await service.findOne(userId, 'search-1');

      expect(result.id).toBe('search-1');
      expect(result.filters).toEqual({ search: 'react', workplaceType: 'remote' });
    });

    it('should throw NotFoundException for a non-existent ID', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce(null);

      await expect(service.findOne(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when saved search belongs to a different user', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce({
        ...mockSaved,
        userId: otherId,
      });

      await expect(service.findOne(userId, 'search-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('should update allowed fields and return deserialized result', async () => {
      const dto = { title: 'Updated Title', isActive: false };
      const result = await service.update(userId, 'search-1', dto);

      expect(mockPrisma.client.orm.public.SavedSearch.where).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when saved search does not exist', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce(null);

      await expect(service.update(userId, 'nonexistent', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when updating another user\'s saved search', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce({
        ...mockSaved,
        userId: otherId,
      });

      await expect(service.update(userId, 'search-1', { title: 'New' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should JSON-serialize filters when provided', async () => {
      const dto = { filters: { search: 'vue', location: 'Berlin' } };
      await service.update(userId, 'search-1', dto);

      const updateCall = mockPrisma.client.orm.public.SavedSearch.update.mock.calls[0][0];
      expect(updateCall['filters']).toBe(JSON.stringify({ search: 'vue', location: 'Berlin' }));
    });
  });

  // =========================================================================
  // remove
  // =========================================================================

  describe('remove', () => {
    it('should delete the saved search and return success message', async () => {
      const result = await service.remove(userId, 'search-1');

      expect(mockPrisma.client.orm.public.SavedSearch.where).toHaveBeenCalled();
      expect(result.message).toContain('deleted successfully');
    });

    it('should throw NotFoundException for non-existent saved search', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce(null);

      await expect(service.remove(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting another user\'s saved search', async () => {
      mockPrisma.client.orm.public.SavedSearch.first.mockResolvedValueOnce({
        ...mockSaved,
        userId: otherId,
      });

      await expect(service.remove(userId, 'search-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // markNotified
  // =========================================================================

  describe('markNotified', () => {
    it('should update lastNotifiedAt for the given saved search', async () => {
      await service.markNotified('search-1');

      expect(mockPrisma.client.orm.public.SavedSearch.where).toHaveBeenCalledWith({ id: 'search-1' });
      expect(mockPrisma.client.orm.public.SavedSearch.update).toHaveBeenCalledWith(
        expect.objectContaining({ lastNotifiedAt: expect.any(String) }),
      );
    });
  });

  // =========================================================================
  // findDueAlerts
  // =========================================================================

  describe('findDueAlerts', () => {
    it('should return active saved searches for the given frequency', async () => {
      const result = await service.findDueAlerts('daily');

      expect(mockPrisma.client.orm.public.SavedSearch.where).toHaveBeenCalledWith({ isActive: true });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should deserialize filters in results', async () => {
      const result = await service.findDueAlerts('weekly');

      if (result.length > 0) {
        expect(typeof result[0].filters).toBe('object');
      }
    });
  });
});
