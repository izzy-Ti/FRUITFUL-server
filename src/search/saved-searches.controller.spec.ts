import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SavedSearchesController } from './saved-searches.controller.js';
import { SavedSearchesService } from './saved-searches.service.js';
import { SavedSearchType, AlertFrequency } from './dto/create-saved-search.dto.js';

describe('SavedSearchesController', () => {
  let controller: SavedSearchesController;
  let mockService: any;

  const mockUser = { id: 'user-abc', email: 'user@example.com', role: 'job_seeker' };

  const mockSaved = {
    id: 'search-1',
    userId: 'user-abc',
    title: 'Remote React Jobs',
    type: SavedSearchType.JOB,
    filters: { search: 'react', workplaceType: 'remote' },
    alertFrequency: AlertFrequency.DAILY,
    isActive: true,
    lastNotifiedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      create: vi.fn().mockResolvedValue(mockSaved),
      findAll: vi.fn().mockResolvedValue({ data: [mockSaved], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }),
      findOne: vi.fn().mockResolvedValue(mockSaved),
      update: vi.fn().mockResolvedValue({ ...mockSaved, title: 'Updated Title' }),
      remove: vi.fn().mockResolvedValue({ message: 'Saved search deleted successfully.' }),
    };

    controller = new SavedSearchesController(mockService as SavedSearchesService);
  });

  // =========================================================================
  // POST /saved-searches
  // =========================================================================

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = {
        title: 'Remote React Jobs',
        type: SavedSearchType.JOB,
        filters: { search: 'react' },
        alertFrequency: AlertFrequency.DAILY,
        isActive: true,
      };

      const result = await controller.create(mockUser as any, dto);

      expect(mockService.create).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result.message).toContain('saved successfully');
      expect(result.savedSearch).toEqual(mockSaved);
    });
  });

  // =========================================================================
  // GET /saved-searches
  // =========================================================================

  describe('findAll', () => {
    it('should return paginated list from service', async () => {
      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(mockUser as any, query as any);

      expect(mockService.findAll).toHaveBeenCalledWith(mockUser.id, query);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // =========================================================================
  // GET /saved-searches/:id
  // =========================================================================

  describe('findOne', () => {
    it('should delegate to service.findOne with userId and id', async () => {
      const result = await controller.findOne(mockUser as any, 'search-1');

      expect(mockService.findOne).toHaveBeenCalledWith(mockUser.id, 'search-1');
      expect(result.id).toBe('search-1');
    });
  });

  // =========================================================================
  // PATCH /saved-searches/:id
  // =========================================================================

  describe('update', () => {
    it('should update and return wrapped response', async () => {
      const dto = { title: 'Updated Title' };
      const result = await controller.update(mockUser as any, 'search-1', dto);

      expect(mockService.update).toHaveBeenCalledWith(mockUser.id, 'search-1', dto);
      expect(result.message).toContain('updated successfully');
      expect(result.savedSearch.title).toBe('Updated Title');
    });
  });

  // =========================================================================
  // DELETE /saved-searches/:id
  // =========================================================================

  describe('remove', () => {
    it('should call service.remove and return message', async () => {
      const result = await controller.remove(mockUser as any, 'search-1');

      expect(mockService.remove).toHaveBeenCalledWith(mockUser.id, 'search-1');
      expect(result.message).toContain('deleted successfully');
    });
  });
});
