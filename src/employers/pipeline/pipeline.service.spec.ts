import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PipelineService, DEFAULT_PIPELINE_STAGES } from './pipeline.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('PipelineService', () => {
  let service: PipelineService;
  let mockPrisma: any;
  let mockNotifications: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'employer@acme.com',
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

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corp',
  };

  const mockOtherEmployer = {
    id: 'emp-profile-2',
    userId: otherEmployerUser.id,
    name: 'Other Corp',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-profile-1',
    title: 'Senior Backend Engineer',
    skills: ['Node.js', 'PostgreSQL', 'Docker'],
    status: 'published',
    location: 'Remote',
  };

  const mockStages = [
    {
      id: 'stage-applied',
      employerId: 'emp-profile-1',
      jobId: null,
      name: 'Applied',
      slug: 'applied',
      order: 0,
      color: '#6366f1',
      stageType: 'applied',
      isDefault: true,
      isSystem: true,
    },
    {
      id: 'stage-screening',
      employerId: 'emp-profile-1',
      jobId: null,
      name: 'Screening',
      slug: 'screening',
      order: 1,
      color: '#06b6d4',
      stageType: 'screening',
      isDefault: true,
      isSystem: false,
    },
    {
      id: 'stage-hired',
      employerId: 'emp-profile-1',
      jobId: null,
      name: 'Hired',
      slug: 'hired',
      order: 5,
      color: '#10b981',
      stageType: 'hired',
      isDefault: true,
      isSystem: true,
    },
    {
      id: 'stage-rejected',
      employerId: 'emp-profile-1',
      jobId: null,
      name: 'Rejected',
      slug: 'rejected',
      order: 6,
      color: '#ef4444',
      stageType: 'rejected',
      isDefault: true,
      isSystem: true,
    },
  ];

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'seeker-profile-1',
    status: 'submitted',
    stageId: 'stage-applied',
    rating: 4,
    tags: ['top_candidate'],
    appliedAt: new Date().toISOString(),
    stageMovedAt: new Date().toISOString(),
    employerNotes: 'Strong profile',
    coverLetter: 'Interested in this role',
    cvUrl: 'https://example.com/cv.pdf',
    portfolioLinks: [],
  };

  const mockSeekerProfile = {
    id: 'seeker-profile-1',
    userId: 'user-seeker-1',
    headline: 'Full Stack Engineer',
    photoUrl: 'https://example.com/photo.jpg',
    location: 'Berlin',
    phone: '+4912345678',
  };

  const mockSeekerUser = {
    id: 'user-seeker-1',
    name: 'Alice Candidate',
    email: 'alice@example.com',
  };

  const createChain = (items: any[], single: any = null) => {
    let currentFilter: any = null;
    const chain: any = {};
    chain.where = vi.fn().mockImplementation((filter?: any) => {
      currentFilter = filter;
      return chain;
    });
    chain.orderBy = vi.fn().mockImplementation(() => chain);
    chain.all = vi.fn().mockImplementation(() => {
      if (currentFilter?.id) {
        return Promise.resolve(items.filter((i) => i.id === currentFilter.id));
      }
      return Promise.resolve(items);
    });
    chain.first = vi.fn().mockImplementation((pk?: any) => {
      const id = pk?.id || currentFilter?.id;
      if (id) {
        return Promise.resolve(items.find((i) => i.id === id) ?? null);
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
    const empChain = createChain([mockEmployer, mockOtherEmployer], mockEmployer);
    const jobChain = createChain([mockJob], mockJob);
    const stageChain = createChain([...mockStages], mockStages[0]);
    const appChain = createChain([mockApplication], mockApplication);
    const profileChain = createChain([mockSeekerProfile], mockSeekerProfile);
    const userChain = createChain([employerUser, mockSeekerUser], employerUser);
    const historyChain = createChain([], null);

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: empChain,
            Job: jobChain,
            PipelineStage: stageChain,
            JobApplication: appChain,
            JobSeekerProfile: profileChain,
            User: userChain,
            ApplicationStatusHistory: historyChain,
          },
        },
      },
    };

    mockNotifications = {
      sendApplicationStatusChangeNotification: vi.fn().mockResolvedValue({ success: true }),
    };

    service = new PipelineService(mockPrisma, mockNotifications);
  });

  // ==========================================
  // STAGES
  // ==========================================

  describe('ensureDefaultStages', () => {
    it('should create default stages if employer has none', async () => {
      mockPrisma.client.orm.public.PipelineStage.all.mockResolvedValueOnce([]);

      const result = await service.ensureDefaultStages('emp-profile-new');

      expect(mockPrisma.client.orm.public.PipelineStage.create).toHaveBeenCalledTimes(DEFAULT_PIPELINE_STAGES.length);
      expect(result).toHaveLength(DEFAULT_PIPELINE_STAGES.length);
    });

    it('should return existing stages if already present', async () => {
      const result = await service.ensureDefaultStages('emp-profile-1');

      expect(mockPrisma.client.orm.public.PipelineStage.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(mockStages.length);
    });
  });

  describe('getStages', () => {
    it('should retrieve stages for employer', async () => {
      const stages = await service.getStages(employerUser);

      expect(stages).toBeDefined();
      expect(stages.length).toBeGreaterThanOrEqual(1);
    });

    it('should retrieve job-specific stages if configured', async () => {
      const jobStage = {
        id: 'stage-job-specific',
        employerId: 'emp-profile-1',
        jobId: 'job-1',
        name: 'Job Specific Stage',
        slug: 'job_specific_stage',
        order: 0,
      };
      mockPrisma.client.orm.public.PipelineStage.all.mockResolvedValueOnce([jobStage]);

      const stages = await service.getStages(employerUser, 'job-1');

      expect(stages).toHaveLength(1);
      expect(stages[0].id).toBe('stage-job-specific');
    });
  });

  describe('createStage', () => {
    it('should create custom stage with generated slug and order', async () => {
      const res = await service.createStage(employerUser, {
        name: 'Cultural Assessment',
        color: '#8b5cf6',
        stageType: 'interview',
      });

      expect(mockPrisma.client.orm.public.PipelineStage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          employerId: 'emp-profile-1',
          name: 'Cultural Assessment',
          slug: 'cultural_assessment',
          color: '#8b5cf6',
          stageType: 'interview',
        }),
      );
      expect(res.id).toBeDefined();
    });

    it('should throw NotFoundException if specified jobId does not belong to employer', async () => {
      mockPrisma.client.orm.public.Job.first.mockResolvedValueOnce(null);

      await expect(
        service.createStage(employerUser, { name: 'Test', jobId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStage', () => {
    it('should update stage properties', async () => {
      const res = await service.updateStage(employerUser, 'stage-screening', {
        name: 'Technical Screening',
        color: '#0ea5e9',
      });

      expect(mockPrisma.client.orm.public.PipelineStage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Technical Screening',
          color: '#0ea5e9',
        }),
      );
      expect(res).toBeDefined();
    });

    it('should throw ForbiddenException if stage belongs to another employer', async () => {
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce({
        ...mockStages[1],
        employerId: 'other-emp',
      });

      await expect(
        service.updateStage(employerUser, 'stage-screening', { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteStage', () => {
    it('should delete custom stage when no candidates are in it', async () => {
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce(mockStages[1]); // Screening
      mockPrisma.client.orm.public.JobApplication.all.mockResolvedValueOnce([]); // No candidates

      const res = await service.deleteStage(employerUser, 'stage-screening');

      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.PipelineStage.delete).toHaveBeenCalled();
    });

    it('should prevent deleting system stages', async () => {
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce(mockStages[0]); // Applied (isSystem: true)

      await expect(
        service.deleteStage(employerUser, 'stage-applied'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if candidates exist and no migration stage provided', async () => {
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce(mockStages[1]); // Screening (not system)
      mockPrisma.client.orm.public.JobApplication.all.mockResolvedValueOnce([mockApplication]);

      await expect(
        service.deleteStage(employerUser, 'stage-screening'),
      ).rejects.toThrow(ConflictException);
    });

    it('should migrate candidates to target stage when migrationStageId is provided', async () => {
      mockPrisma.client.orm.public.PipelineStage.first
        .mockResolvedValueOnce(mockStages[1]) // stage to delete
        .mockResolvedValueOnce(mockStages[0]); // target stage
      mockPrisma.client.orm.public.JobApplication.all.mockResolvedValueOnce([mockApplication]);

      const res = await service.deleteStage(employerUser, 'stage-screening', 'stage-applied');

      expect(res.success).toBe(true);
      expect(res.migratedCandidates).toBe(1);
      expect(mockPrisma.client.orm.public.JobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ stageId: 'stage-applied' }),
      );
      expect(mockPrisma.client.orm.public.PipelineStage.delete).toHaveBeenCalled();
    });
  });

  describe('reorderStages', () => {
    it('should update orders for stages', async () => {
      const res = await service.reorderStages(employerUser, {
        stages: [
          { stageId: 'stage-screening', order: 0 },
          { stageId: 'stage-applied', order: 1 },
        ],
      });

      expect(mockPrisma.client.orm.public.PipelineStage.update).toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });

  describe('resetDefaultStages', () => {
    it('should reset stages back to platform defaults', async () => {
      const res = await service.resetDefaultStages(employerUser);

      expect(mockPrisma.client.orm.public.PipelineStage.delete).toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });

  // ==========================================
  // KANBAN BOARD & CANDIDATE TRANSITIONS
  // ==========================================

  describe('getKanbanBoard', () => {
    it('should return complete Kanban board with columns, candidates, and metrics', async () => {
      const board = await service.getKanbanBoard(employerUser, 'job-1');

      expect(board.job.id).toBe('job-1');
      expect(board.columns).toBeDefined();
      expect(board.columns.length).toBe(mockStages.length);
      expect(board.metrics.totalCandidates).toBe(1);

      // Candidate card in Applied column
      const appliedCol = board.columns.find((c) => c.stage.slug === 'applied');
      expect(appliedCol?.candidates).toHaveLength(1);
      expect(appliedCol?.candidates[0].candidate.name).toBe('Alice Candidate');
      expect(appliedCol?.candidates[0].matchingScore).toBeGreaterThan(0);
    });

    it('should filter board candidates by minimum rating', async () => {
      const board = await service.getKanbanBoard(employerUser, 'job-1', { minRating: 5 });
      const appliedCol = board.columns.find((c) => c.stage.slug === 'applied');
      expect(appliedCol?.candidates).toHaveLength(0); // rating is 4
    });

    it('should throw ForbiddenException if job does not belong to employer', async () => {
      mockPrisma.client.orm.public.Job.first.mockResolvedValueOnce({
        ...mockJob,
        employerId: 'other-emp-id',
      });

      await expect(
        service.getKanbanBoard(employerUser, 'job-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('moveCandidate', () => {
    it('should move candidate to target stage, map status, record history, and notify', async () => {
      mockPrisma.client.orm.public.JobApplication.first.mockResolvedValueOnce(mockApplication);
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce(mockStages[1]); // Screening -> 'under_review'

      const res = await service.moveCandidate(employerUser, 'app-1', {
        targetStageId: 'stage-screening',
        notes: 'Passed initial screening',
        notifyCandidate: true,
      });

      expect(res.success).toBe(true);
      expect(res.stageId).toBe('stage-screening');
      expect(res.status).toBe('under_review');
      expect(mockPrisma.client.orm.public.JobApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          stageId: 'stage-screening',
          status: 'under_review',
        }),
      );
      expect(mockPrisma.client.orm.public.ApplicationStatusHistory.create).toHaveBeenCalled();
      expect(mockNotifications.sendApplicationStatusChangeNotification).toHaveBeenCalled();
    });

    it('should throw NotFoundException if target stage does not exist', async () => {
      mockPrisma.client.orm.public.JobApplication.first.mockResolvedValueOnce(mockApplication);
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValueOnce(null);

      await expect(
        service.moveCandidate(employerUser, 'app-1', { targetStageId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('batchMoveCandidates', () => {
    it('should bulk move multiple candidates', async () => {
      mockPrisma.client.orm.public.JobApplication.first.mockResolvedValue(mockApplication);
      mockPrisma.client.orm.public.PipelineStage.first.mockResolvedValue(mockStages[1]);

      const res = await service.batchMoveCandidates(employerUser, {
        applicationIds: ['app-1'],
        targetStageId: 'stage-screening',
        notes: 'Bulk advance',
      });

      expect(res.success).toBe(true);
      expect(res.movedCount).toBe(1);
    });
  });

  describe('updateCandidateCard', () => {
    it('should update candidate card rating, tags, and notes', async () => {
      mockPrisma.client.orm.public.JobApplication.first
        .mockResolvedValueOnce(mockApplication)
        .mockResolvedValueOnce({
          ...mockApplication,
          rating: 5,
          tags: ['top_candidate', 'fast_learner'],
          employerNotes: 'Excellent performance',
        });

      const res = await service.updateCandidateCard(employerUser, 'app-1', {
        rating: 5,
        tags: ['top_candidate', 'fast_learner'],
        employerNotes: 'Excellent performance',
      });

      expect(res.success).toBe(true);
      expect(res.rating).toBe(5);
      expect(res.tags).toContain('fast_learner');
      expect(mockPrisma.client.orm.public.JobApplication.update).toHaveBeenCalled();
    });
  });
});
