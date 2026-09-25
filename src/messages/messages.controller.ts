import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';
import type { UploadedFile as StoredFile } from '../storage/storage.service.js';
import { MessagesService } from './messages.service.js';
import { MessagesGateway } from './messages.gateway.js';
import {
  CreateConversationDto,
  SendMessageDto,
  QueryConversationsDto,
  QueryMessagesDto,
  UpdateConversationStatusDto,
  ReportMessageDto,
} from './dto/index.js';

@Controller('conversations')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway,
  ) {}

  /**
   * Start a new conversation or retrieve existing conversation thread.
   */
  @Post()
  async createOrGetConversation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messagesService.createOrGetConversation(user, dto);
  }

  /**
   * List conversations for the authenticated user.
   */
  @Get()
  async listConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryConversationsDto,
  ) {
    return this.messagesService.listConversations(user, query);
  }

  /**
   * Query online presence for one or more users.
   */
  @Get('online-status')
  async getOnlineStatus(@Query('userIds') userIds?: string | string[]) {
    const ids = Array.isArray(userIds)
      ? userIds
      : userIds
        ? userIds.split(',').map((id) => id.trim())
        : [];

    const presence: Record<string, any> = {};
    for (const id of ids) {
      presence[id] = this.messagesGateway.getUserPresence(id);
    }
    return presence;
  }

  /**
   * Get single conversation details by ID.
   */
  @Get(':id')
  async getConversationById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.messagesService.getConversationById(user, id);
  }

  /**
   * Update conversation status (active, archived, blocked).
   */
  @Patch(':id/status')
  async updateConversationStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationStatusDto,
  ) {
    return this.messagesService.updateConversationStatus(user, id, dto);
  }

  /**
   * List paginated messages for a conversation thread.
   */
  @Get(':id/messages')
  async getMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messagesService.getMessages(user, id, query);
  }

  /**
   * Send a message to a conversation thread.
   */
  @Post(':id/messages')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(user, id, dto);
  }

  /**
   * Mark all unread messages in a conversation as read.
   */
  @Patch(':id/read')
  async markMessagesAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.messagesService.markMessagesAsRead(user, id);
  }

  /**
   * Upload a file attachment for a conversation thread.
   */
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: StoredFile,
  ) {
    if (!file) {
      throw new BadRequestException('File is required for upload. Use multipart key "file".');
    }
    return this.messagesService.uploadAttachment(user, id, file);
  }

  /**
   * Report an abusive or violating message.
   */
  @Post('messages/:messageId/report')
  async reportMessage(
    @CurrentUser() user: AuthUser,
    @Param('messageId') messageId: string,
    @Body() dto: ReportMessageDto,
  ) {
    return this.messagesService.reportMessage(user, messageId, dto);
  }
}
