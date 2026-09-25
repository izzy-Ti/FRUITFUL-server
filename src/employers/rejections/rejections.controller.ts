import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { RejectionsService } from './rejections.service.js';
import {
  RejectCandidateDto,
  CreateRejectionReasonDto,
  QueryRejectionAnalyticsDto,
} from './dto/index.js';

@Controller('employers')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER, Role.ADMIN)
export class RejectionsController {
  constructor(private readonly rejectionsService: RejectionsService) {}

  /**
   * Reject a candidate application with structured reason code and optional feedback.
   */
  @Post('candidates/reject')
  async rejectCandidate(
    @CurrentUser() user: AuthUser,
    @Body() dto: RejectCandidateDto,
  ) {
    return this.rejectionsService.rejectCandidate(user, dto);
  }

  /**
   * List available rejection reasons (system defaults and employer custom).
   */
  @Get('rejection-reasons')
  async listRejectionReasons(@CurrentUser() user: AuthUser) {
    return this.rejectionsService.listRejectionReasons(user);
  }

  /**
   * Define custom rejection reason for the employer.
   */
  @Post('rejection-reasons')
  async createCustomReason(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRejectionReasonDto,
  ) {
    return this.rejectionsService.createCustomReason(user, dto);
  }

  /**
   * Get rejection analytics and leak breakdown by category, reason code, and job.
   */
  @Get('rejections/analytics')
  async getRejectionAnalytics(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryRejectionAnalyticsDto,
  ) {
    return this.rejectionsService.getRejectionAnalytics(user, query);
  }
}
