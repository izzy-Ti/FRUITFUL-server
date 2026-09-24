import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmployersService } from './employers.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('EmployersService', () => {
  let service: EmployersService;

  const mockUser = {
    id: 'user-emp-1',
    email: 'hr@safari.com',
    name: 'Safari HR',
  };

  const mockEmployerProfile = {
    id: 'emp-1',
    userId: 'user-emp-1',
    name: 'Safari Tech Inc',
    logoUrl: 'https://example.com/logo.png',
    description: 'Tech company in East Africa',
    industry: 'Technology',
    companySize: '51-200',
    websiteUrl: 'https://safari.com',
    location: 'Nairobi, Kenya',
    contactEmail: 'contact@safari.com',
    contactPhone: '+254700000000',
    verificationStatus: 'pending',
    verifiedAt: null,
    rejectionReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          User: {
            where: vi.fn(),
          },
          EmployerProfile: {
            where: vi.fn(),
            create: vi.fn(),
            all: vi.fn(),
            orderBy: vi.fn(),
          },
        },
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<EmployersService>(EmployersService);
    vi.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('should return null if employer profile not found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const res = await service.getMyProfile('user-emp-1');
      expect(res).toBeNull();
    });

    it('should return profile with user details if found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.getMyProfile('user-emp-1');
      expect(res).toBeDefined();
      expect(res?.name).toBe('Safari Tech Inc');
      expect(res?.user?.email).toBe('hr@safari.com');
    });
  });

  describe('upsertProfile', () => {
    it('should update existing profile', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
        update: vi.fn().mockResolvedValue({ ...mockEmployerProfile, name: 'Updated Tech' }),
      });
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.upsertProfile('user-emp-1', {
        name: 'Updated Tech',
      });

      expect(res.name).toBe('Safari Tech Inc');
    });

    it('should create new profile if not found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(mockEmployerProfile),
      });
      mockPrismaService.client.orm.public.EmployerProfile.create.mockResolvedValue(mockEmployerProfile);
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.upsertProfile('user-emp-1', {
        name: 'Safari Tech Inc',
      });

      expect(res.name).toBe('Safari Tech Inc');
      expect(mockPrismaService.client.orm.public.EmployerProfile.create).toHaveBeenCalled();
    });
  });

  describe('getProfileById', () => {
    it('should return profile if found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
      });
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.getProfileById('emp-1');
      expect(res.name).toBe('Safari Tech Inc');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.getProfileById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('requestVerification', () => {
    it('should throw BadRequestException if profile does not exist', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.requestVerification('user-unknown')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should set status to pending', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockEmployerProfile),
        update: vi.fn().mockResolvedValue({}),
      });
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.requestVerification('user-emp-1');
      expect(res.verificationStatus).toBe('pending');
    });
  });

  describe('updateVerificationStatus (Admin)', () => {
    it('should verify employer organization', async () => {
      mockPrismaService.client.orm.public.EmployerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockEmployerProfile, verificationStatus: 'verified' }),
        update: vi.fn().mockResolvedValue({}),
      });
      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      const res = await service.updateVerificationStatus('emp-1', {
        status: 'verified',
      });

      expect(res.verificationStatus).toBe('verified');
    });
  });
});
