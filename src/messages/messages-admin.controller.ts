import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';
import { MessagesService } from './messages.service.js';
import { ReviewReportDto, QueryReportsDto } from './dto/index.js';

@Controller('admin/moderation/messages')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MessagesAdminController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * List all reported messages with filtering and pagination.
   */
  @Get('reports')
  async listReports(@Query() query: QueryReportsDto) {
    return this.messagesService.listMessageReports(query);
  }

  /**
   * Review a reported message and apply moderation actions (hide message, suspend user, dismiss).
   */
  @Patch('reports/:id')
  async reviewReport(
    @CurrentUser() adminUser: AuthUser,
    @Param('id') reportId: string,
    @Body() dto: ReviewReportDto,
    @Req() req: Request,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
    return this.messagesService.reviewMessageReport(adminUser, reportId, dto, ipAddress);
  }
}
