import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService, type UploadedFile as StoredFile } from './storage.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';

@Controller('upload')
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Upload candidate CV document (PDF, DOC, DOCX up to 10MB).
   */
  @Post('cv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCv(@UploadedFile() file?: StoredFile) {
    if (!file) {
      throw new BadRequestException('File is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'cvs',
      resourceType: 'raw',
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
    });

    return {
      message: 'CV uploaded successfully.',
      ...result,
    };
  }

  /**
   * Upload image for profile avatar, company logo, or portfolio screenshot (JPG, PNG, WEBP up to 5MB).
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file?: StoredFile) {
    if (!file) {
      throw new BadRequestException('Image is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'images',
      resourceType: 'image',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
      maxSizeBytes: 5 * 1024 * 1024, // 5MB
    });

    return {
      message: 'Image uploaded successfully.',
      ...result,
    };
  }

  /**
   * Upload general portfolio document or asset (up to 15MB).
   */
  @Post('document')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@UploadedFile() file?: StoredFile) {
    if (!file) {
      throw new BadRequestException('Document is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'documents',
      resourceType: 'auto',
      maxSizeBytes: 15 * 1024 * 1024, // 15MB
    });

    return {
      message: 'Document uploaded successfully.',
      ...result,
    };
  }
}
