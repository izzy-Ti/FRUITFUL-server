import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BulkActionsService } from './bulk-actions.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('BulkActionsService', () => {
  let service: BulkActionsService;
  let mockPrisma: any;
  let mockNotifications: any;

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

  const mockEmployer = {
    id: 'emp-profile-1',
    userId: employerUser.id,
    name: 'Acme Corp',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-profile-1',
    title: 'Senior Developer',
  };

  const mockApps = [
    {
      id: 'app-1',
      jobId: 'job-1',
      profileId: 'seeker-1',
      status: 'submitted',
      tags: ['react'],
      rating: 3,
      employerNotes: '',
      appliedAt: '2026-09-01T10:00:00Z',
    },
    {
      id: 'app-2',
      jobId: 'job-1',
      profileId: 'seeker-2',
      status: 'submitted',
      tags: ['nodejs', 'react'],
      rating: 4,
      employerNotes: '',
      appliedAt: '2026-09-02T10:00:00Z',
    },
  ];

  const mockSeekerProfile = {
    id: 'seeker-1',
    userId: 'user-seeker-1',
    headline: 'Fullstack Dev',
    location: 'Nairobi',
    phone: '+254700000000',
  };

  const mockSeekerUser = {
    id: 'user-seeker-1',
    name: 'John Seeker',
    email: 'john@example.com',
  };

  beforeEach(() => {
    mockNotifications = {
      sendApplicationStatusChangeNotification: vi.fn().mockResolvedValue(true),
    };

    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => mockEmployer),
              }),
              first: vi.fn().mockResolvedValue(mockEmployer),
            },
            Job: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockImplementation(async () => mockJob),
              }),
            },
            JobApplication: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  return mockApps.find((a) => a.id === filter.id) || null;
                }),
                update: vi.fn().mockResolvedValue({ count: 1 }),
              })),
            },
            ApplicationStatusHistory: {
              create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
            },
            CandidateNote: {
              create: vi.fn().mockResolvedValue({ id: 'note-1' }),
            },
            JobSeekerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockSeekerProfile),
              }),
            },
            User: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockSeekerUser),
              }),
            },
            PipelineStage: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue({ id: 'stage-1', name: 'Technical Interview' }),
              }),
            },
          },
        },
      },
    };

    service = new BulkActionsService(mockPrisma, mockNotifications);
  });

  describe('executeBulkAction - status_update', () => {
    it('should bulk update statuses and dispatch notifications if requested', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'status_update',
        applicationIds: ['app-1', 'app-2'],
        status: 'interviewing',
        stageId: 'stage-1',
        notifyCandidates: true,
        notes: 'Advancing to interview stage',
      });

      expect(res.success).toBe(true);
      expect(res.processedCount).toBe(2);
      expect(mockPrisma.client.orm.public.JobApplication.where).toHaveBeenCalled();
      expect(mockPrisma.client.orm.public.ApplicationStatusHistory.create).toHaveBeenCalledTimes(2);
      expect(mockNotifications.sendApplicationStatusChangeNotification).toHaveBeenCalled();
    });
  });

  describe('executeBulkAction - reject', () => {
    it('should bulk reject candidates with reason and optional notification', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'reject',
        applicationIds: ['app-1', 'app-2'],
        rejectionReason: 'Position closed',
        notifyCandidates: true,
      });

      expect(res.success).toBe(true);
      expect(res.processedCount).toBe(2);
      expect(mockNotifications.sendApplicationStatusChangeNotification).toHaveBeenCalled();
    });
  });

  describe('executeBulkAction - add_tags & remove_tags', () => {
    it('should bulk add tags deduplicating them', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'add_tags',
        applicationIds: ['app-1'],
        tags: ['Fast-Track', 'react'],
      });

      expect(res.success).toBe(true);
      expect(res.results[0].tags).toContain('fast-track');
      expect(res.results[0].tags).toContain('react');
    });

    it('should throw BadRequestException if tags empty on add_tags', async () => {
      await expect(
        service.executeBulkAction(employerUser, {
          action: 'add_tags',
          applicationIds: ['app-1'],
          tags: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should bulk remove tags from applications', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'remove_tags',
        applicationIds: ['app-2'],
        tags: ['react'],
      });

      expect(res.success).toBe(true);
      expect(res.results[0].tags).toEqual(['nodejs']);
    });

    it('should throw BadRequestException if tags empty on remove_tags', async () => {
      await expect(
        service.executeBulkAction(employerUser, {
          action: 'remove_tags',
          applicationIds: ['app-1'],
          tags: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeBulkAction - set_rating', () => {
    it('should bulk set rating between 1 and 5', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'set_rating',
        applicationIds: ['app-1', 'app-2'],
        rating: 5,
      });

      expect(res.success).toBe(true);
      expect(res.processedCount).toBe(2);
    });

    it('should throw BadRequestException if rating is invalid', async () => {
      await expect(
        service.executeBulkAction(employerUser, {
          action: 'set_rating',
          applicationIds: ['app-1'],
          rating: 6,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeBulkAction - add_note', () => {
    it('should bulk create candidate notes', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'add_note',
        applicationIds: ['app-1', 'app-2'],
        notes: 'Reviewed in weekly hiring sprint',
        noteCategory: 'general',
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException if note content is missing', async () => {
      await expect(
        service.executeBulkAction(employerUser, {
          action: 'add_note',
          applicationIds: ['app-1'],
          notes: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('executeBulkAction - export', () => {
    it('should generate export records and valid CSV content', async () => {
      const res = await service.executeBulkAction(employerUser, {
        action: 'export',
        applicationIds: ['app-1'],
      });

      expect(res.success).toBe(true);
      expect(res.exportData).toBeDefined();
      expect(res.exportData?.length).toBe(1);
      expect(res.csvContent).toBeDefined();
      expect(res.csvContent).toContain('Senior Developer');
      expect(res.csvContent).toContain('John Seeker');
    });
  });

  describe('executeBulkAction - Error handling', () => {
    it('should throw NotFoundException if no matching applications found', async () => {
      await expect(
        service.executeBulkAction(employerUser, {
          action: 'status_update',
          applicationIds: ['non-existent-app'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
