import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

export interface UploadedFile {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

export interface FileMetadataRecord {
  id: string;
  uploadedById: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  secureUrl: string | null;
  publicId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorageUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format?: string;
  bytes?: number;
  originalFilename?: string;
  resourceType: string;
  metadata?: FileMetadataRecord;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly isConfigured: boolean;
  private readonly defaultFolder: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const cloudName = this.configService.get<string>('storage.cloudinary.cloudName');
    const apiKey = this.configService.get<string>('storage.cloudinary.apiKey');
    const apiSecret = this.configService.get<string>('storage.cloudinary.apiSecret');
    const cloudinaryUrl = this.configService.get<string>('storage.cloudinary.url');

    this.defaultFolder = this.configService.get<string>('storage.cloudinary.folder', 'fruitful');

    if (cloudinaryUrl) {
      cloudinary.config({ cloudinary_url: cloudinaryUrl });
      this.isConfigured = true;
      this.logger.log('Cloudinary initialized via CLOUDINARY_URL.');
    } else if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(`Cloudinary initialized for cloud: "${cloudName}".`);
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'Cloudinary credentials are not configured in .env. StorageService running in mock/fallback mode for development and testing.',
      );
    }
  }

  /**
   * Upload a file buffer to Cloudinary and record file metadata in database.
   */
  async uploadBuffer(
    file: UploadedFile,
    options: {
      folder?: string;
      resourceType?: 'image' | 'raw' | 'auto' | 'video';
      allowedMimeTypes?: string[];
      maxSizeBytes?: number;
      uploadedById?: string | null;
      entityType?: string;
      entityId?: string | null;
      fileName?: string;
      saveMetadata?: boolean;
    } = {},
  ): Promise<StorageUploadResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file or buffer was provided for upload.');
    }

    // Comprehensive file safety validation (extension denylist, magic bytes, SVG sanitization)
    const sanitizedName = this.validateFileSafety(file);
    file.originalname = sanitizedName;

    if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
      const isAllowed = options.allowedMimeTypes.some((type) => {
        if (type.endsWith('/*')) {
          return file.mimetype.startsWith(type.replace('/*', ''));
        }
        return file.mimetype === type;
      });

      if (!isAllowed) {
        throw new BadRequestException(
          `Invalid file type (${file.mimetype}). Allowed types: ${options.allowedMimeTypes.join(', ')}`,
        );
      }
    }

    if (options.maxSizeBytes && file.size > options.maxSizeBytes) {
      const maxMb = (options.maxSizeBytes / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(`File size exceeds maximum allowed size of ${maxMb}MB.`);
    }

    const folder = options.folder ? `${this.defaultFolder}/${options.folder}` : this.defaultFolder;
    const resourceType = options.resourceType || 'auto';

    let uploadResult: {
      url: string;
      secureUrl: string;
      publicId: string;
      format?: string;
      bytes?: number;
      originalFilename?: string;
      resourceType: string;
    };

    // Mock/development fallback if Cloudinary credentials are not provided
    if (!this.isConfigured) {
      const mockId = `mock_${randomUUID()}`;
      const mockExt = file.originalname.split('.').pop() || 'bin';
      const mockUrl = `https://res.cloudinary.com/fruitful/mock/${folder}/${mockId}.${mockExt}`;

      this.logger.debug(
        `[MOCK STORAGE] Stored "${file.originalname}" (${file.size} bytes) -> ${mockUrl}`,
      );

      uploadResult = {
        url: mockUrl,
        secureUrl: mockUrl,
        publicId: `${folder}/${mockId}`,
        format: mockExt,
        bytes: file.size,
        originalFilename: file.originalname,
        resourceType,
      };
    } else {
      uploadResult = await new Promise<{
        url: string;
        secureUrl: string;
        publicId: string;
        format?: string;
        bytes?: number;
        originalFilename?: string;
        resourceType: string;
      }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: resourceType,
            use_filename: true,
            unique_filename: true,
          },
          (error, result?: UploadApiResponse) => {
            if (error || !result) {
              this.logger.error('Cloudinary upload error:', error);
              return reject(
                new InternalServerErrorException(
                  error?.message || 'Failed to upload asset to Cloudinary.',
                ),
              );
            }

            resolve({
              url: result.url,
              secureUrl: result.secure_url,
              publicId: result.public_id,
              format: result.format,
              bytes: result.bytes,
              originalFilename: file.originalname,
              resourceType: result.resource_type,
            });
          },
        );

        const stream = Readable.from(file.buffer);
        stream.pipe(uploadStream);
      });
    }

    // Persist file metadata to database
    let metadata: FileMetadataRecord | undefined;
    if (options.saveMetadata !== false) {
      try {
        const created = await this.prisma.client.orm.public.FileMetadata.create({
          id: randomUUID(),
          uploadedById: options.uploadedById || null,
          fileName: options.fileName || file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: uploadResult.url,
          secureUrl: uploadResult.secureUrl,
          publicId: uploadResult.publicId,
          entityType: options.entityType || 'general',
          entityId: options.entityId || null,
        });
        metadata = created as unknown as FileMetadataRecord;
      } catch (err) {
        this.logger.warn('Failed to record FileMetadata in database:', err);
      }
    }

    return {
      ...uploadResult,
      metadata,
    };
  }

  /**
   * Retrieve file metadata record by ID with authorization enforcement.
   */
  async getFileMetadata(id: string, user?: AuthUser): Promise<FileMetadataRecord> {
    const file = await this.prisma.client.orm.public.FileMetadata
      .where({ id })
      .first();

    if (!file) {
      throw new NotFoundException(`File metadata with ID "${id}" was not found.`);
    }

    const record = file as unknown as FileMetadataRecord;

    if (user) {
      const allowed = await this.canAccessFile(user, record);
      if (!allowed) {
        throw new ForbiddenException('You do not have permission to access this protected document.');
      }
    }

    return record;
  }

  /**
   * Check whether a user is authorized to access a specific file.
   */
  async canAccessFile(user: AuthUser, file: FileMetadataRecord): Promise<boolean> {
    // 1. Platform Admin has global access
    if (user.role === Role.ADMIN) {
      return true;
    }

    // 2. Owner has direct access
    if (file.uploadedById === user.id) {
      return true;
    }

    // 3. Public assets (avatars, logos, portfolio screenshots, message attachments)
    if (file.entityType === 'image' || file.entityType === 'general' || file.entityType === 'message_attachment') {
      return true;
    }


    // 4. Protected CV document: only candidate or employer with an application from candidate
    if (file.entityType === 'cv') {
      if (user.role === Role.EMPLOYER) {
        try {
          if (!file.uploadedById) return false;

          const profile = await this.prisma.client.orm.public.JobSeekerProfile
            .where({ userId: file.uploadedById })
            .first();

          const employer = await this.prisma.client.orm.public.EmployerProfile
            .where({ userId: user.id })
            .first();

          if (profile && employer) {
            const employerJobs = await this.prisma.client.orm.public.Job
              .where({ employerId: employer.id })
              .all();
            const jobIds = new Set(employerJobs.map((j) => j.id));

            const applications = await this.prisma.client.orm.public.JobApplication
              .where({ profileId: profile.id })
              .all();

            const hasActiveApplication = applications.some((app) => jobIds.has(app.jobId));
            if (hasActiveApplication) {
              return true;
            }
          }
        } catch (err) {
          this.logger.warn(`Error verifying employer access to CV ${file.id}: ${err}`);
        }
      }
      return false;
    }

    return false;
  }

  /**
   * Retrieve secure access details for an authorized user.
   */
  async getFileAccess(id: string, user: AuthUser) {
    const file = await this.getFileMetadata(id, user);
    return {
      authorized: true,
      fileId: file.id,
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      downloadUrl: file.secureUrl || file.url,
      entityType: file.entityType,
    };
  }

  /**
   * Inspect and sanitize uploaded files for web vulnerabilities and execution risks.
   */
  private validateFileSafety(file: UploadedFile): string {
    const originalName = file.originalname || 'unnamed';
    const cleanName = originalName
      .replace(/[\0\r\n]/g, '')
      .replace(/(\.\.[\/\\])+/g, '')
      .trim();

    // 1. Extension denylist check
    const lowerName = cleanName.toLowerCase();
    const DANGEROUS_EXTENSIONS = [
      '.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.phtml', '.php3', '.php4', '.php5',
      '.phps', '.js', '.mjs', '.cjs', '.py', '.vbs', '.scr', '.jar', '.html', '.htm',
      '.jsp', '.asp', '.aspx', '.cgi', '.pl', '.dll', '.com', '.msi',
    ];

    for (const ext of DANGEROUS_EXTENSIONS) {
      if (lowerName.endsWith(ext)) {
        throw new BadRequestException(`Executable or script file type "${ext}" is prohibited.`);
      }
    }

    // 2. SVG inspection for stored XSS vectors
    if (file.mimetype === 'image/svg+xml' || lowerName.endsWith('.svg')) {
      const content = file.buffer.toString('utf8').toLowerCase();
      const dangerousPatterns = [
        '<script', 'javascript:', 'onload=', 'onerror=', 'onclick=', '<iframe', 'xlink:href="javascript:',
      ];
      for (const pattern of dangerousPatterns) {
        if (content.includes(pattern)) {
          throw new BadRequestException('SVG image contains embedded scripts and was rejected for security.');
        }
      }
    }

    // 3. Magic bytes / file signatures validation
    if (file.buffer && file.buffer.length >= 4) {
      if (file.mimetype === 'application/pdf') {
        const isPdf =
          file.buffer[0] === 0x25 &&
          file.buffer[1] === 0x50 &&
          file.buffer[2] === 0x44 &&
          file.buffer[3] === 0x46; // %PDF
        if (!isPdf) {
          throw new BadRequestException('File content does not match standard PDF document structure.');
        }
      } else if (file.mimetype === 'image/jpeg') {
        const isJpg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
        if (!isJpg) {
          throw new BadRequestException('File content does not match standard JPEG image format.');
        }
      } else if (file.mimetype === 'image/png') {
        const isPng =
          file.buffer[0] === 0x89 &&
          file.buffer[1] === 0x50 &&
          file.buffer[2] === 0x4e &&
          file.buffer[3] === 0x47;
        if (!isPng) {
          throw new BadRequestException('File content does not match standard PNG image format.');
        }
      } else if (file.mimetype === 'image/webp') {
        const isRiff =
          file.buffer[0] === 0x52 &&
          file.buffer[1] === 0x49 &&
          file.buffer[2] === 0x46 &&
          file.buffer[3] === 0x46; // RIFF
        if (!isRiff) {
          throw new BadRequestException('File content does not match standard WebP image format.');
        }
      }
    }

    return cleanName;
  }

  /**
   * Retrieve all files uploaded by a user with optional entity type filter.
   */
  async getMyFiles(userId: string, entityType?: string): Promise<FileMetadataRecord[]> {
    let collection = this.prisma.client.orm.public.FileMetadata.where({ uploadedById: userId });

    if (entityType) {
      collection = collection.where((f) => f.entityType.eq(entityType));
    }

    const files = await collection.orderBy((f) => f.createdAt.desc()).all();
    return files as unknown as FileMetadataRecord[];
  }

  /**
   * Delete an asset from Cloudinary.
   */
  async deleteFile(
    publicId: string,
    resourceType: 'image' | 'raw' | 'video' = 'image',
  ): Promise<{ result: string }> {
    if (!this.isConfigured || publicId.startsWith('fruitful/mock_') || publicId.startsWith('mock_')) {
      return { result: 'ok' };
    }

    try {
      const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      return res;
    } catch (err) {
      this.logger.error(`Error deleting Cloudinary asset "${publicId}":`, err);
      throw new InternalServerErrorException('Failed to delete asset from Cloudinary.');
    }
  }
}
