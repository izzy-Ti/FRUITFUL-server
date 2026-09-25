import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MessageAttachmentDto {
  @IsString()
  @IsOptional()
  fileId?: string;

  @IsString()
  url: string;

  @IsString()
  fileName: string;

  @IsNumber()
  @Min(0)
  fileSize: number;

  @IsString()
  mimeType: string;
}

export class SendMessageDto {
  /**
   * Text content of the message. Optional if attachments are provided.
   */
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  content?: string;

  /**
   * Optional file attachments (documents, images, audio, etc.).
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentDto)
  @IsOptional()
  attachments?: MessageAttachmentDto[];
}
