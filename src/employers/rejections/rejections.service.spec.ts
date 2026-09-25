import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { RejectionsService } from './rejections.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { RejectionCategory } from './dto/index.js';

describe('RejectionsService', () => {
  let service: RejectionsService;
  let mockPrisma: any;
  let mockNotifications: any;

  const employerUser: AuthUser = {
    id: 'user-emp-1',
    email: 'hr@acme.com',
    name: 'Acme Recruiter',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const candidateUser: AuthUser = {
    id: 'user-cand-1',
    email: 'candidate@example.com',
    name: 'Candidate One',
    role: Role.JOB_SEEKER,
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
    title: 'Data Platform Engineer',
  };

  const mockCandidateProfile = {
    id: 'cand-profile-1',
    userId: candidateUser.id,
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'cand-profile-1',
    status: 'interviewing',
    employerNotes: null,
  };

  const mockSystemReason = {
    id: 'sys-1',
    employerId: null,
    code: 'skills_mismatch',
    label: 'Skills Mismatch',
    category: 'skills',
    description: 'Required skills not met',
    defaultEmailTemplate: 'Qualifications did not match requirements.',
    isSystem: true,
    isActive: true,
  };

  const mockCustomReason = {
    id: 'cust-1',
    employerId: 'emp-profile-1',
    code: 'relocation_unsupported',
    label: 'Relocation Unsupported',
    category: 'logistics',
    description: 'Company does not offer relocation',
    defaultEmailTemplate: 'Unable to provide relocation.',
    isSystem: false,
    isActive: true,
  };

  beforeEach(() => {
    mockNotifications = {
      sendCandidateRejectionNotification: vi.fn().mockResolvedValue(true),
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
            JobSeekerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockCandidateProfile),
              }),
            },
            User: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(candidateUser),
              }),
            },
            Job: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockJob),
                all: vi.fn().mockResolvedValue([mockJob]),
              }),
            },
            JobApplication: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockApplication),
                update: vi.fn().mockResolvedValue({ count: 1 }),
              }),
              all: vi.fn().mockResolvedValue([
                {
                  ...mockApplication,
                  status: 'rejected',
                  rejectionReasonCode: 'skills_mismatch',
                  rejectionCategory: 'skills',
                  rejectedAt: new Date().toISOString(),
                },
              ]),
            },
            ApplicationStatusHistory: {
              create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
            },
            CandidateNote: {
              create: vi.fn().mockResolvedValue({ id: 'note-1' }),
            },
            RejectionReason: {
              all: vi.fn().mockResolvedValue([mockSystemReason, mockCustomReason]),
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.code === mockSystemReason.code) return mockSystemReason;
                  return null;
                }),
              })),
              create: vi.fn().mockImplementation(async (data) => ({ ...data })),
            },
          },
        },
      },
    };

    service = new RejectionsService(mockPrisma, mockNotifications);
  });

  describe('listRejectionReasons', () => {
    it('should list both system and employer custom reasons', async () => {
      const reasons = await service.listRejectionReasons(employerUser);
      expect(reasons.length).toBe(2);
      expect(reasons.some((r) => r.isSystem)).toBe(true);
      expect(reasons.some((r) => !r.isSystem)).toBe(true);
    });
  });

  describe('createCustomReason', () => {
    it('should create a custom rejection reason with normalized code', async () => {
      const res = await service.createCustomReason(employerUser, {
        code: 'Visa Sponsorship Not Available',
        label: 'Visa Sponsorship',
        category: RejectionCategory.LOGISTICS,
        description: 'Unable to sponsor work visas',
      });

      expect(res.code).toBe('visa_sponsorship_not_available');
      expect(mockPrisma.client.orm.public.RejectionReason.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if code already exists', async () => {
      await expect(
        service.createCustomReason(employerUser, {
          code: 'skills_mismatch',
          label: 'Skills Mismatch',
          category: RejectionCategory.SKILLS,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectCandidate', () => {
    it('should reject candidate application, update history, create internal note, and dispatch email', async () => {
      const res = await service.rejectCandidate(employerUser, {
        applicationId: 'app-1',
        reasonCode: 'skills_mismatch',
        feedback: 'Need deeper experience in Apache Spark and Kafka.',
        notifyCandidate: true,
        createInternalNote: true,
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe('rejected');
      expect(res.category).toBe('skills');
      expect(mockPrisma.client.orm.public.JobApplication.where().update).toHaveBeenCalled();
      expect(mockPrisma.client.orm.public.ApplicationStatusHistory.create).toHaveBeenCalled();
      expect(mockPrisma.client.orm.public.CandidateNote.create).toHaveBeenCalled();
      expect(mockNotifications.sendCandidateRejectionNotification).toHaveBeenCalled();
    });

    it('should throw NotFoundException if application does not exist', async () => {
      mockPrisma.client.orm.public.JobApplication.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.rejectCandidate(employerUser, {
          applicationId: 'missing-app',
          reasonCode: 'skills_mismatch',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if job does not belong to employer', async () => {
      mockPrisma.client.orm.public.Job.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'job-1', employerId: 'other-emp' }),
      });

      await expect(
        service.rejectCandidate(employerUser, {
          applicationId: 'app-1',
          reasonCode: 'skills_mismatch',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRejectionAnalytics', () => {
    it('should return aggregated rejection analytics by category and reason code', async () => {
      const analytics = await service.getRejectionAnalytics(employerUser);
      expect(analytics.totalRejected).toBe(1);
      expect(analytics.categoryBreakdown[0].category).toBe('skills');
      expect(analytics.categoryBreakdown[0].percentage).toBe(100);
      expect(analytics.jobBreakdown[0].jobTitle).toBe('Data Platform Engineer');
    });
  });
});
