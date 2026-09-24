import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';

describe('EmployersController', () => {
  let controller: EmployersController;
  let service: EmployersService;

  const mockUser: AuthUser = {
    id: 'user-emp-1',
    email: 'employer@fruitful.com',
    name: 'Enterprise Co',
    emailVerified: true,
    role: 'employer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployerProfile = {
    id: 'emp-1',
    userId: 'user-emp-1',
    name: 'Enterprise Co',
    logoUrl: 'https://example.com/logo.png',
    description: 'Premier enterprise solutions',
    industry: 'Technology',
    companySize: '100-500',
    websiteUrl: 'https://enterprise.com',
    location: 'Addis Ababa',
    contactEmail: 'info@enterprise.com',
    contactPhone: '+251911000000',
    verificationStatus: 'verified',
    verifiedAt: new Date().toISOString(),
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEmployersService = {
    getMyProfile: vi.fn(),
    upsertProfile: vi.fn(),
    requestVerification: vi.fn(),
    findAll: vi.fn(),
    getProfileById: vi.fn(),
    findAllAdmin: vi.fn(),
    updateVerificationStatus: vi.fn(),
    getVerificationHistory: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployersController],
      providers: [
        { provide: EmployersService, useValue: mockEmployersService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<EmployersController>(EmployersController);
    service = module.get<EmployersService>(EmployersService);
    vi.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('should return employer profile', async () => {
      mockEmployersService.getMyProfile.mockResolvedValue(mockEmployerProfile);

      const res = await controller.getMyProfile(mockUser);
      expect(res.profile).toEqual(mockEmployerProfile);
    });
  });

  describe('updateMyProfile', () => {
    it('should update organization profile', async () => {
      mockEmployersService.upsertProfile.mockResolvedValue(mockEmployerProfile);

      const res = await controller.updateMyProfile(mockUser, {
        name: 'Enterprise Co',
        industry: 'Technology',
      });

      expect(res.message).toContain('profile updated successfully');
      expect(res.profile).toEqual(mockEmployerProfile);
    });
  });

  describe('requestVerification', () => {
    it('should submit verification request', async () => {
      mockEmployersService.requestVerification.mockResolvedValue({
        ...mockEmployerProfile,
        verificationStatus: 'pending',
      });

      const res = await controller.requestVerification(mockUser);
      expect(res.message).toContain('verification request submitted');
      expect(res.profile.verificationStatus).toBe('pending');
    });
  });

  describe('getMyVerificationHistory', () => {
    it('should return verification history for employer', async () => {
      mockEmployersService.getMyProfile.mockResolvedValue(mockEmployerProfile);
      mockEmployersService.getVerificationHistory.mockResolvedValue([
        { id: 'v-1', employerId: 'emp-1', status: 'pending' },
      ]);

      const res = await controller.getMyVerificationHistory(mockUser);
      expect(res.employerId).toBe('emp-1');
      expect(res.history).toHaveLength(1);
    });
  });

  describe('findAll and findOne', () => {
    it('should list verified employers', async () => {
      mockEmployersService.findAll.mockResolvedValue([mockEmployerProfile]);

      const res = await controller.findAll({});
      expect(res.count).toBe(1);
      expect(res.employers).toEqual([mockEmployerProfile]);
    });

    it('should get employer by id', async () => {
      mockEmployersService.getProfileById.mockResolvedValue(mockEmployerProfile);

      const res = await controller.findOne('emp-1');
      expect(res).toEqual(mockEmployerProfile);
    });
  });

  describe('Admin verification', () => {
    it('should list all employers for admin', async () => {
      mockEmployersService.findAllAdmin.mockResolvedValue([mockEmployerProfile]);

      const res = await controller.findAllAdmin({});
      expect(res.count).toBe(1);
    });

    it('should update verification status', async () => {
      mockEmployersService.updateVerificationStatus.mockResolvedValue({
        ...mockEmployerProfile,
        verificationStatus: 'verified',
      });

      const res = await controller.updateVerification(mockUser, 'emp-1', {
        status: 'verified',
      });

      expect(res.message).toContain('status updated to "verified"');
      expect(res.profile.verificationStatus).toBe('verified');
      expect(mockEmployersService.updateVerificationStatus).toHaveBeenCalledWith('emp-1', { status: 'verified' }, 'user-emp-1');
    });

    it('should get verification history for admin', async () => {
      mockEmployersService.getVerificationHistory.mockResolvedValue([
        { id: 'v-1', employerId: 'emp-1', status: 'verified' },
      ]);

      const res = await controller.getAdminVerificationHistory('emp-1');
      expect(res.employerId).toBe('emp-1');
      expect(res.history).toHaveLength(1);
    });
  });
});
