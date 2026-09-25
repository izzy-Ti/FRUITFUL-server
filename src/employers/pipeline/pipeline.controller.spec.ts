import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineController } from './pipeline.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('PipelineController', () => {
  let controller: PipelineController;
  let mockService: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'employer@acme.com',
    name: 'Employer User',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      getStages: vi.fn().mockResolvedValue([{ id: 'stage-1', name: 'Applied' }]),
      createStage: vi.fn().mockResolvedValue({ id: 'stage-2', name: 'Interview' }),
      updateStage: vi.fn().mockResolvedValue({ id: 'stage-1', name: 'Updated' }),
      deleteStage: vi.fn().mockResolvedValue({ success: true }),
      reorderStages: vi.fn().mockResolvedValue([]),
      resetDefaultStages: vi.fn().mockResolvedValue([]),
      getKanbanBoard: vi.fn().mockResolvedValue({ job: { id: 'job-1' }, columns: [], metrics: {} }),
      moveCandidate: vi.fn().mockResolvedValue({ success: true, stageId: 'stage-2' }),
      batchMoveCandidates: vi.fn().mockResolvedValue({ success: true, movedCount: 2 }),
      updateCandidateCard: vi.fn().mockResolvedValue({ success: true, rating: 5 }),
    };

    controller = new PipelineController(mockService);
  });

  describe('getStages', () => {
    it('should delegate to getStages', async () => {
      const res = await controller.getStages(mockUser, 'job-1');
      expect(mockService.getStages).toHaveBeenCalledWith(mockUser, 'job-1');
      expect(res).toHaveLength(1);
    });
  });

  describe('createStage', () => {
    it('should delegate to createStage', async () => {
      const dto = { name: 'Interview' };
      const res = await controller.createStage(mockUser, dto);
      expect(mockService.createStage).toHaveBeenCalledWith(mockUser, dto);
      expect(res.id).toBe('stage-2');
    });
  });

  describe('updateStage', () => {
    it('should delegate to updateStage', async () => {
      const dto = { name: 'Updated' };
      const res = await controller.updateStage(mockUser, 'stage-1', dto);
      expect(mockService.updateStage).toHaveBeenCalledWith(mockUser, 'stage-1', dto);
      expect(res?.name).toBe('Updated');
    });
  });

  describe('deleteStage', () => {
    it('should delegate to deleteStage with migrationStageId', async () => {
      const res = await controller.deleteStage(mockUser, 'stage-1', 'stage-target');
      expect(mockService.deleteStage).toHaveBeenCalledWith(mockUser, 'stage-1', 'stage-target');
      expect(res.success).toBe(true);
    });
  });

  describe('reorderStages', () => {
    it('should delegate to reorderStages', async () => {
      const dto = { stages: [{ stageId: 'stage-1', order: 0 }] };
      await controller.reorderStages(mockUser, dto, 'job-1');
      expect(mockService.reorderStages).toHaveBeenCalledWith(mockUser, dto, 'job-1');
    });
  });

  describe('resetDefaultStages', () => {
    it('should delegate to resetDefaultStages', async () => {
      await controller.resetDefaultStages(mockUser, 'job-1');
      expect(mockService.resetDefaultStages).toHaveBeenCalledWith(mockUser, 'job-1');
    });
  });

  describe('getKanbanBoard', () => {
    it('should delegate to getKanbanBoard', async () => {
      const res = await controller.getKanbanBoard(mockUser, 'job-1', { minRating: 4 });
      expect(mockService.getKanbanBoard).toHaveBeenCalledWith(mockUser, 'job-1', { minRating: 4 });
      expect(res.job.id).toBe('job-1');
    });
  });

  describe('moveCandidate', () => {
    it('should delegate to moveCandidate', async () => {
      const dto = { targetStageId: 'stage-2' };
      const res = await controller.moveCandidate(mockUser, 'app-1', dto);
      expect(mockService.moveCandidate).toHaveBeenCalledWith(mockUser, 'app-1', dto);
      expect(res.success).toBe(true);
    });
  });

  describe('batchMoveCandidates', () => {
    it('should delegate to batchMoveCandidates', async () => {
      const dto = { applicationIds: ['app-1', 'app-2'], targetStageId: 'stage-2' };
      const res = await controller.batchMoveCandidates(mockUser, dto);
      expect(mockService.batchMoveCandidates).toHaveBeenCalledWith(mockUser, dto);
      expect(res.movedCount).toBe(2);
    });
  });

  describe('updateCandidateCard', () => {
    it('should delegate to updateCandidateCard', async () => {
      const dto = { rating: 5, tags: ['top_pick'] };
      const res = await controller.updateCandidateCard(mockUser, 'app-1', dto);
      expect(mockService.updateCandidateCard).toHaveBeenCalledWith(mockUser, 'app-1', dto);
      expect(res.rating).toBe(5);
    });
  });
});
