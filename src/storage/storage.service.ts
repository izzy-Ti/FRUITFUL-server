import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

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

export interface StorageUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  format?: string;
  bytes?: number;
  originalFilename?: string;
  resourceType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly isConfigured: boolean;
  private readonly defaultFolder: string;

  constructor(private readonly configService: ConfigService) {
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
   * Upload a file buffer to Cloudinary.
   */
  async uploadBuffer(
    file: UploadedFile,
    options: {
      folder?: string;
      resourceType?: 'image' | 'raw' | 'auto' | 'video';
      allowedMimeTypes?: string[];
      maxSizeBytes?: number;
    } = {},
  ): Promise<StorageUploadResult> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file or buffer was provided for upload.');
    }

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

    // Mock/development fallback if Cloudinary credentials are not provided
    if (!this.isConfigured) {
      const mockId = `mock_${randomUUID()}`;
      const mockExt = file.originalname.split('.').pop() || 'bin';
      const mockUrl = `https://res.cloudinary.com/fruitful/mock/${folder}/${mockId}.${mockExt}`;

      this.logger.debug(
        `[MOCK STORAGE] Stored "${file.originalname}" (${file.size} bytes) -> ${mockUrl}`,
      );

      return {
        url: mockUrl,
        secureUrl: mockUrl,
        publicId: `${folder}/${mockId}`,
        format: mockExt,
        bytes: file.size,
        originalFilename: file.originalname,
        resourceType,
      };
    }

    return new Promise<StorageUploadResult>((resolve, reject) => {
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
