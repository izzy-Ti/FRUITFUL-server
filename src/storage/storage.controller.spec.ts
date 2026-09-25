import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';
import { BadRequestException } from '@nestjs/common';

describe('StorageController', () => {
  let controller: StorageController;
  let service: StorageService;

  const mockStorageService = {
    uploadBuffer: vi.fn(),
    getFileMetadata: vi.fn(),
    getFileAccess: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: mockStorageService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<StorageController>(StorageController);
    service = module.get<StorageService>(StorageService);
    vi.clearAllMocks();
  });

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'user1@example.com',
    name: 'Test Seeker',
    emailVerified: true,
    role: 'job_seeker',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('uploadCv', () => {
    it('should throw BadRequestException if no file is provided', async () => {
      await expect(controller.uploadCv(mockUser, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should upload CV successfully', async () => {
      const mockResult = {
        url: 'https://cloudinary.com/cv.pdf',
        secureUrl: 'https://cloudinary.com/cv.pdf',
        publicId: 'cvs/abc',
      };
      mockStorageService.uploadBuffer.mockResolvedValue(mockResult);

      const mockFile = { originalname: 'cv.pdf', size: 100, buffer: Buffer.from('123'), mimetype: 'application/pdf' };
      const res = await controller.uploadCv(mockUser, mockFile);

      expect(res.message).toBe('CV uploaded successfully.');
      expect(res.url).toBe(mockResult.url);
      expect(mockStorageService.uploadBuffer).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({ folder: 'cvs', uploadedById: 'user-1' }),
      );
    });
  });

  describe('uploadImage', () => {
    it('should upload image successfully', async () => {
      const mockResult = {
        url: 'https://cloudinary.com/pic.jpg',
        secureUrl: 'https://cloudinary.com/pic.jpg',
        publicId: 'images/pic',
      };
      mockStorageService.uploadBuffer.mockResolvedValue(mockResult);

      const mockFile = { originalname: 'pic.jpg', size: 100, buffer: Buffer.from('123'), mimetype: 'image/jpeg' };
      const res = await controller.uploadImage(mockUser, mockFile);

      expect(res.message).toBe('Image uploaded successfully.');
      expect(res.url).toBe(mockResult.url);
    });
  });

  describe('protected file metadata and access', () => {
    it('should get file metadata for authorized user', async () => {
      mockStorageService.getFileMetadata.mockResolvedValue({ id: 'f-1', fileName: 'resume.pdf' });
      const res = await controller.getFileMetadata(mockUser, 'f-1');
      expect(res.file.id).toBe('f-1');
      expect(mockStorageService.getFileMetadata).toHaveBeenCalledWith('f-1', mockUser);
    });

    it('should get file access url for authorized user', async () => {
      mockStorageService.getFileAccess.mockResolvedValue({ authorized: true, downloadUrl: 'https://cloudinary.com/cv.pdf' });
      const res = await controller.getFileAccess(mockUser, 'f-1');
      expect(res.authorized).toBe(true);
      expect(mockStorageService.getFileAccess).toHaveBeenCalledWith('f-1', mockUser);
    });
  });
});
