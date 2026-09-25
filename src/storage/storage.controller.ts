import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  Param,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService, type UploadedFile as StoredFile } from './storage.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('upload')
@UseGuards(AuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Upload candidate CV document (PDF, DOC, DOCX up to 10MB).
   */
  @Post('cv')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCv(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: StoredFile,
  ) {
    if (!file) {
      throw new BadRequestException('File is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'cvs',
      resourceType: 'raw',
      uploadedById: user.id,
      entityType: 'cv',
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
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: StoredFile,
  ) {
    if (!file) {
      throw new BadRequestException('Image is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'images',
      resourceType: 'image',
      uploadedById: user.id,
      entityType: 'image',
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
  async uploadDocument(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: StoredFile,
  ) {
    if (!file) {
      throw new BadRequestException('Document is required for upload. Use multipart key "file".');
    }

    const result = await this.storageService.uploadBuffer(file, {
      folder: 'documents',
      resourceType: 'auto',
      uploadedById: user.id,
      entityType: 'document',
      maxSizeBytes: 15 * 1024 * 1024, // 15MB
    });

    return {
      message: 'Document uploaded successfully.',
      ...result,
    };
  }

  /**
   * Get all files uploaded by the authenticated user.
   */
  @Get('my-files')
  async getMyFiles(
    @CurrentUser() user: AuthUser,
    @Query('entityType') entityType?: string,
  ) {
    const files = await this.storageService.getMyFiles(user.id, entityType);
    return {
      files,
    };
  }

  /**
   * Retrieve metadata for a specific uploaded file (enforces authorization).
   */
  @Get('files/:id')
  async getFileMetadata(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const file = await this.storageService.getFileMetadata(id, user);
    return {
      file,
    };
  }

  /**
   * Request authorized access URL for a protected file.
   */
  @Get('files/:id/access')
  async getFileAccess(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.storageService.getFileAccess(id, user);
  }
}
