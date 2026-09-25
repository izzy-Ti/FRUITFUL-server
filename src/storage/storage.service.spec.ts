import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

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
    uploadedById: 'user-candidate-1',
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
          JobSeekerProfile: {
            where: () => ({
              first: async () => ({ id: 'prof-1', userId: 'user-candidate-1' }),
            }),
          },
          EmployerProfile: {
            where: () => ({
              first: async () => ({ id: 'emp-1', userId: 'user-employer-1' }),
            }),
          },
          Job: {
            where: () => ({
              all: async () => [{ id: 'job-1', employerId: 'emp-1' }],
            }),
          },
          JobApplication: {
            where: () => ({
              all: async () => [{ id: 'app-1', jobId: 'job-1', profileId: 'prof-1' }],
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

  describe('uploadBuffer - Validation & Security', () => {
    it('should throw BadRequestException if file has no buffer', async () => {
      await expect(service.uploadBuffer(undefined as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject file with dangerous executable extension', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
        size: 1024,
        buffer: Buffer.from('binary-code'),
      };

      await expect(service.uploadBuffer(mockFile)).rejects.toThrow(
        /Executable or script file type/i,
      );
    });

    it('should reject SVG files containing embedded script tags (XSS prevention)', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'logo.svg',
        mimetype: 'image/svg+xml',
        size: 200,
        buffer: Buffer.from('<svg><script>alert("XSS")</script></svg>'),
      };

      await expect(service.uploadBuffer(mockFile)).rejects.toThrow(
        /embedded scripts/i,
      );
    });

    it('should reject file if MIME type does not match allowed types', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'document.txt',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('plain text'),
      };

      await expect(
        service.uploadBuffer(mockFile, {
          allowedMimeTypes: ['application/pdf'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject file if PDF magic bytes are invalid', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('NOT A REAL PDF FILE'),
      };

      await expect(
        service.uploadBuffer(mockFile, {
          allowedMimeTypes: ['application/pdf'],
        }),
      ).rejects.toThrow(/does not match standard PDF/i);
    });

    it('should upload valid PDF with correct magic bytes successfully', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'my-resume.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF-1.4 real pdf content here'),
      };

      const result = await service.uploadBuffer(mockFile, {
        folder: 'cvs',
        allowedMimeTypes: ['application/pdf'],
      });

      expect(result.url).toContain('fruitful/mock/fruitful/cvs');
      expect(result.format).toBe('pdf');
      expect(result.bytes).toBe(1024);
    });
  });

  describe('Protected File Access & Authorization', () => {
    const candidateUser: AuthUser = {
      id: 'user-candidate-1',
      email: 'candidate@fruitful.com',
      name: 'Candidate User',
      emailVerified: true,
      role: Role.JOB_SEEKER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const employerUser: AuthUser = {
      id: 'user-employer-1',
      email: 'employer@fruitful.com',
      name: 'Employer User',
      emailVerified: true,
      role: Role.EMPLOYER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const adminUser: AuthUser = {
      id: 'admin-1',
      email: 'admin@fruitful.com',
      name: 'Admin User',
      emailVerified: true,
      role: Role.ADMIN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const strangerUser: AuthUser = {
      id: 'stranger-999',
      email: 'stranger@fruitful.com',
      name: 'Stranger User',
      emailVerified: true,
      role: Role.JOB_SEEKER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should allow file owner to access their own CV', async () => {
      const allowed = await service.canAccessFile(candidateUser, mockFileMetadataRecord);
      expect(allowed).toBe(true);
    });

    it('should allow admin to access any file', async () => {
      const allowed = await service.canAccessFile(adminUser, mockFileMetadataRecord);
      expect(allowed).toBe(true);
    });

    it('should allow employer with active applicant application to access CV', async () => {
      const allowed = await service.canAccessFile(employerUser, mockFileMetadataRecord);
      expect(allowed).toBe(true);
    });

    it('should deny unauthorized stranger access to protected CV', async () => {
      const allowed = await service.canAccessFile(strangerUser, mockFileMetadataRecord);
      expect(allowed).toBe(false);

      await expect(
        service.getFileMetadata('file-123', strangerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return download details for authorized file access', async () => {
      const access = await service.getFileAccess('file-123', candidateUser);
      expect(access.authorized).toBe(true);
      expect(access.downloadUrl).toBeDefined();
      expect(access.fileId).toBe('file-123');
    });
  });
});
