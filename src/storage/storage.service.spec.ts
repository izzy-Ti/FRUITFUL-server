import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('StorageService', () => {
  let service: StorageService;

  const mockConfigService = {
    get: (key: string, defaultVal?: string) => {
      if (key === 'storage.cloudinary.folder') return 'fruitful';
      return defaultVal || '';
    },
  };

  const mockFileMetadataRecord = {
    id: 'file-123',
    uploadedById: 'user-1',
    fileName: 'my-resume.pdf',
    originalName: 'my-resume.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    url: 'https://res.cloudinary.com/fruitful/mock/cvs/file-123.pdf',
    secureUrl: 'https://res.cloudinary.com/fruitful/mock/cvs/file-123.pdf',
    publicId: 'cvs/file-123',
    entityType: 'cv',
    entityId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          FileMetadata: {
            create: async (data: any) => ({
              ...data,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
            where: () => ({
              first: async () => mockFileMetadataRecord,
              orderBy: () => ({
                all: async () => [mockFileMetadataRecord],
              }),
            }),
          },
        },
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('uploadBuffer', () => {
    it('should throw BadRequestException if file has no buffer', async () => {
      await expect(service.uploadBuffer(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject file if MIME type is not allowed', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'exploit.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        buffer: Buffer.from('test'),
      };

      await expect(
        service.uploadBuffer(mockFile, {
          allowedMimeTypes: ['application/pdf'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file if size exceeds limit', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 5 * 1024 * 1024, // 5MB
        buffer: Buffer.from('test'),
      };

      await expect(
        service.uploadBuffer(mockFile, {
          maxSizeBytes: 2 * 1024 * 1024, // 2MB max
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload successfully and return storage URL in fallback mode', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'my-resume.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('resume content'),
      };

      const result = await service.uploadBuffer(mockFile, {
        folder: 'cvs',
        allowedMimeTypes: ['application/pdf'],
      });

      expect(result.url).toContain('fruitful/mock/fruitful/cvs');
      expect(result.format).toBe('pdf');
      expect(result.bytes).toBe(1024);
      expect(result.originalFilename).toBe('my-resume.pdf');
    });
  });

  describe('deleteFile', () => {
    it('should return ok for mock asset deletion', async () => {
      const result = await service.deleteFile('fruitful/mock_123');
      expect(result.result).toBe('ok');
    });
  });
});
