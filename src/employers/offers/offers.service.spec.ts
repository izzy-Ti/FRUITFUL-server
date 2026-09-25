import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OffersService } from './offers.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('OffersService', () => {
  let service: OffersService;
  let mockPrisma: any;
  let mockNotifications: any;
  let offerUpdateMock: any;

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

  const candidateUser: AuthUser = {
    id: 'user-cand-1',
    email: 'alex@example.com',
    name: 'Alex Johnson',
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
    location: 'Nairobi',
  };

  const mockJob = {
    id: 'job-1',
    employerId: 'emp-profile-1',
    title: 'Senior Engineer',
    companyName: 'Acme Corp',
  };

  const mockCandidateProfile = {
    id: 'cand-profile-1',
    userId: candidateUser.id,
    headline: 'Senior Backend Engineer',
  };

  const mockApplication = {
    id: 'app-1',
    jobId: 'job-1',
    profileId: 'cand-profile-1',
    status: 'interviewing',
  };

  const mockOffer = {
    id: 'offer-1',
    applicationId: 'app-1',
    employerId: 'emp-profile-1',
    candidateId: 'cand-profile-1',
    jobId: 'job-1',
    status: 'sent',
    salary: 120000,
    currency: 'USD',
    salaryPeriod: 'yearly',
    startDate: '2026-11-01',
    expiryDate: '2026-10-15T00:00:00.000Z',
    benefits: ['Health Insurance', 'Remote Stipend'],
    offerLetterUrl: 'https://example.com/offer.pdf',
    notes: 'Signing bonus included',
    candidateFeedback: null,
    sentAt: '2026-09-25T10:00:00.000Z',
    respondedAt: null,
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
  };

  beforeEach(() => {
    offerUpdateMock = vi.fn().mockResolvedValue({ count: 1 });

    mockNotifications = {
      sendJobOfferNotification: vi.fn().mockResolvedValue(true),
      sendOfferStatusNotification: vi.fn().mockResolvedValue(true),
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
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockCandidateProfile.id || filter.userId === candidateUser.id) {
                    return mockCandidateProfile;
                  }
                  return null;
                }),
              })),
            },
            User: {
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === candidateUser.id) return candidateUser;
                  if (filter.id === employerUser.id) return employerUser;
                  return null;
                }),
              })),
            },
            Job: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockJob),
              }),
            },
            JobApplication: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockApplication),
                update: vi.fn().mockResolvedValue({ count: 1 }),
              }),
            },
            ApplicationStatusHistory: {
              create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
            },
            JobOffer: {
              create: vi.fn().mockImplementation(async (data) => ({
                ...data,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })),
              where: vi.fn().mockImplementation((filter) => ({
                first: vi.fn().mockImplementation(async () => {
                  if (filter.id === mockOffer.id) return { ...mockOffer };
                  return null;
                }),
                all: vi.fn().mockResolvedValue([mockOffer]),
                update: offerUpdateMock,
              })),
            },
          },
        },
      },
    };

    service = new OffersService(mockPrisma, mockNotifications);
  });

  describe('createOffer', () => {
    it('should create and immediately send offer, updating application to offered', async () => {
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]), // No active offers
      });

      const res = await service.createOffer(employerUser, {
        applicationId: 'app-1',
        salary: 120000,
        currency: 'USD',
        startDate: '2026-11-01',
        sendImmediately: true,
      });

      expect(res).toBeDefined();
      expect(res.salary).toBe(120000);
      expect(mockPrisma.client.orm.public.JobApplication.where().update).toHaveBeenCalled();
      expect(mockNotifications.sendJobOfferNotification).toHaveBeenCalled();
    });

    it('should throw ConflictException if an active offer already exists', async () => {
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockOffer]),
      });

      await expect(
        service.createOffer(employerUser, {
          applicationId: 'app-1',
          salary: 130000,
          startDate: '2026-11-01',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listOffers', () => {
    it('should list offers for employer', async () => {
      const res = await service.listOffers(employerUser);
      expect(res.count).toBe(1);
      expect(res.offers[0].status).toBe('sent');
    });

    it('should hide draft offers from candidate', async () => {
      const draftOffer = { ...mockOffer, id: 'draft-1', status: 'draft' };
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockOffer, draftOffer]),
      });

      const res = await service.listOffers(candidateUser);
      expect(res.count).toBe(1);
      expect(res.offers[0].id).toBe('offer-1');
    });
  });

  describe('getOfferById', () => {
    it('should retrieve offer details for candidate', async () => {
      const res = await service.getOfferById(candidateUser, 'offer-1');
      expect(res.id).toBe('offer-1');
      expect(res.salary).toBe(120000);
    });

    it('should throw NotFoundException for candidate if offer is draft', async () => {
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockOffer, status: 'draft' }),
      });

      await expect(service.getOfferById(candidateUser, 'offer-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOffer', () => {
    it('should allow employer to update salary and benefits', async () => {
      const res = await service.updateOffer(employerUser, 'offer-1', {
        salary: 130000,
        benefits: ['Full Healthcare', 'Stock Options'],
      });

      expect(offerUpdateMock).toHaveBeenCalled();
    });

    it('should throw BadRequestException if offer already accepted', async () => {
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockOffer, status: 'accepted' }),
      });

      await expect(
        service.updateOffer(employerUser, 'offer-1', { salary: 140000 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendOffer', () => {
    it('should transition draft offer to sent and notify candidate', async () => {
      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockOffer, status: 'draft' }),
        update: vi.fn().mockResolvedValue({ count: 1 }),
      });

      const res = await service.sendOffer(employerUser, 'offer-1');
      expect(mockNotifications.sendJobOfferNotification).toHaveBeenCalled();
    });
  });

  describe('respondToOffer', () => {
    it('should mark offer accepted and application hired', async () => {
      const res = await service.respondToOffer(candidateUser, 'offer-1', {
        action: 'accept',
      });

      expect(mockPrisma.client.orm.public.JobApplication.where().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'hired' }),
      );
      expect(mockNotifications.sendOfferStatusNotification).toHaveBeenCalled();
    });

    it('should mark offer rejected when declined by candidate', async () => {
      const res = await service.respondToOffer(candidateUser, 'offer-1', {
        action: 'decline',
        feedback: 'Accepted competing offer.',
      });

      expect(mockPrisma.client.orm.public.JobApplication.where().update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
      expect(mockNotifications.sendOfferStatusNotification).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not recipient candidate', async () => {
      await expect(
        service.respondToOffer(
          { ...candidateUser, id: 'someone-else' },
          'offer-1',
          { action: 'accept' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('withdrawOffer', () => {
    it('should withdraw offer with reason', async () => {
      const res = await service.withdrawOffer(employerUser, 'offer-1', {
        reason: 'Budget cut',
      });

      expect(offerUpdateMock).toHaveBeenCalled();
    });
  });

  describe('getOfferAnalytics', () => {
    it('should return offer conversion stats and salary breakdown', async () => {
      const acceptedOffer = { ...mockOffer, id: 'offer-2', status: 'accepted', salary: 100000 };
      const rejectedOffer = { ...mockOffer, id: 'offer-3', status: 'rejected', salary: 110000 };

      mockPrisma.client.orm.public.JobOffer.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockOffer, acceptedOffer, rejectedOffer]),
      });

      const analytics = await service.getOfferAnalytics(employerUser);
      expect(analytics.totalOffers).toBe(3);
      expect(analytics.acceptedOffers).toBe(1);
      expect(analytics.rejectedOffers).toBe(1);
      expect(analytics.acceptanceRatePercent).toBe(50);
      expect(analytics.salaryAverages['USD'].avg).toBe(110000);
    });
  });
});
