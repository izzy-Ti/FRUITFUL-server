import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OffersController } from './offers.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('OffersController', () => {
  let controller: OffersController;
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
      createOffer: vi.fn().mockResolvedValue({ id: 'offer-1', salary: 100000 }),
      listOffers: vi.fn().mockResolvedValue({ count: 1, offers: [] }),
      getOfferById: vi.fn().mockResolvedValue({ id: 'offer-1', salary: 100000 }),
      updateOffer: vi.fn().mockResolvedValue({ id: 'offer-1', salary: 110000 }),
      sendOffer: vi.fn().mockResolvedValue({ id: 'offer-1', status: 'sent' }),
      respondToOffer: vi.fn().mockResolvedValue({ id: 'offer-1', status: 'accepted' }),
      withdrawOffer: vi.fn().mockResolvedValue({ id: 'offer-1', status: 'withdrawn' }),
      getOfferAnalytics: vi.fn().mockResolvedValue({ totalOffers: 1, acceptanceRatePercent: 100 }),
    };

    controller = new OffersController(mockService);
  });

  describe('createOffer', () => {
    it('should delegate to offersService.createOffer', async () => {
      const dto = { applicationId: 'app-1', salary: 100000, startDate: '2026-11-01' };
      const res = await controller.createOffer(mockUser, dto as any);
      expect(mockService.createOffer).toHaveBeenCalledWith(mockUser, dto);
      expect(res.id).toBe('offer-1');
    });
  });

  describe('listEmployerOffers & listCandidateOffers', () => {
    it('should delegate to listOffers for employer', async () => {
      const query = { status: 'sent' };
      const res = await controller.listEmployerOffers(mockUser, query);
      expect(mockService.listOffers).toHaveBeenCalledWith(mockUser, query);
      expect(res.count).toBe(1);
    });

    it('should delegate to listOffers for candidate', async () => {
      const query = {};
      const res = await controller.listCandidateOffers(mockUser, query);
      expect(mockService.listOffers).toHaveBeenCalledWith(mockUser, query);
      expect(res.count).toBe(1);
    });
  });

  describe('getOfferById', () => {
    it('should delegate to getOfferById', async () => {
      const res = await controller.getOfferById(mockUser, 'offer-1');
      expect(mockService.getOfferById).toHaveBeenCalledWith(mockUser, 'offer-1');
      expect(res.id).toBe('offer-1');
    });
  });

  describe('updateOffer', () => {
    it('should delegate to updateOffer', async () => {
      const dto = { salary: 110000 };
      const res = await controller.updateOffer(mockUser, 'offer-1', dto);
      expect(mockService.updateOffer).toHaveBeenCalledWith(mockUser, 'offer-1', dto);
      expect(res.salary).toBe(110000);
    });
  });

  describe('sendOffer', () => {
    it('should delegate to sendOffer', async () => {
      const res = await controller.sendOffer(mockUser, 'offer-1');
      expect(mockService.sendOffer).toHaveBeenCalledWith(mockUser, 'offer-1');
      expect(res.status).toBe('sent');
    });
  });

  describe('respondToOffer', () => {
    it('should delegate to respondToOffer', async () => {
      const dto = { action: 'accept' as const };
      const res = await controller.respondToOffer(mockUser, 'offer-1', dto);
      expect(mockService.respondToOffer).toHaveBeenCalledWith(mockUser, 'offer-1', dto);
      expect(res.status).toBe('accepted');
    });
  });

  describe('withdrawOffer', () => {
    it('should delegate to withdrawOffer', async () => {
      const dto = { reason: 'Position closed' };
      const res = await controller.withdrawOffer(mockUser, 'offer-1', dto);
      expect(mockService.withdrawOffer).toHaveBeenCalledWith(mockUser, 'offer-1', dto);
      expect(res.status).toBe('withdrawn');
    });
  });

  describe('getOfferAnalytics', () => {
    it('should delegate to getOfferAnalytics', async () => {
      const res = await controller.getOfferAnalytics(mockUser);
      expect(mockService.getOfferAnalytics).toHaveBeenCalledWith(mockUser);
      expect(res.totalOffers).toBe(1);
    });
  });
});
