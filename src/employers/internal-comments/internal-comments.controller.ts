import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { InternalCommentsService } from './internal-comments.service.js';
import {
  CreateInternalCommentDto,
  UpdateInternalCommentDto,
} from './dto/index.js';

@Controller('employers')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER, Role.ADMIN)
export class InternalCommentsController {
  constructor(private readonly commentsService: InternalCommentsService) {}

  /**
   * Post an internal comment or reply on a candidate application.
   */
  @Post('comments')
  async createComment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInternalCommentDto,
  ) {
    return this.commentsService.createComment(user, dto);
  }

  /**
   * Retrieve threaded internal comments for a candidate application.
   */
  @Get('applications/:applicationId/comments')
  async listComments(
    @CurrentUser() user: AuthUser,
    @Param('applicationId') applicationId: string,
  ) {
    return this.commentsService.listComments(user, applicationId);
  }

  /**
   * Update an internal comment.
   */
  @Patch('comments/:id')
  async updateComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInternalCommentDto,
  ) {
    return this.commentsService.updateComment(user, id, dto);
  }

  /**
   * Delete an internal comment.
   */
  @Delete('comments/:id')
  async deleteComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.commentsService.deleteComment(user, id);
  }
}
