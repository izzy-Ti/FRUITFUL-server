import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service.js';
import {
  ApplyJobDto,
  UpdateApplicationStatusDto,
  QueryApplicationsDto,
  ShortlistCandidateDto,
  BulkShortlistDto,
} from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // ==========================================
  // CANDIDATE ENDPOINTS
  // ==========================================

  /**
   * Candidate applies to an open job.
   */
  @Post('apply')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async applyToJob(
    @CurrentUser() user: AuthUser,
    @Body() dto: ApplyJobDto,
  ) {
    const application = await this.applicationsService.applyToJob(user.id, dto);
    return {
      message: 'Application submitted successfully.',
      application,
    };
  }

  /**
   * Candidate application dashboard: summary metrics, recent applications, and activity feed.
   */
  @Get('candidate/dashboard')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getCandidateDashboard(@CurrentUser() user: AuthUser) {
    return this.applicationsService.getCandidateDashboard(user.id);
  }

  /**
   * Candidate views all their submitted applications.
   */
  @Get('me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getMyApplications(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    const applications = await this.applicationsService.getMyApplications(user.id, status);
    return {
      count: applications.length,
      applications,
    };
  }

  // ==========================================
  // EMPLOYER ENDPOINTS
  // ==========================================

  /**
   * Employer applicant dashboard: jobs breakdown, applicant funnel metrics, and recent applicants.
   */
  @Get('employer/dashboard')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getEmployerDashboard(@CurrentUser() user: AuthUser) {
    const isAdmin = user.role === Role.ADMIN;
    return this.applicationsService.getEmployerDashboard(user.id, isAdmin);
  }

  /**
   * Employer: Bulk shortlist multiple candidates across one or more applications.
   */
  @Post('bulk-shortlist')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async bulkShortlistCandidates(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkShortlistDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.applicationsService.bulkShortlistCandidates(
      user.id,
      dto.applicationIds,
      dto.notes,
      isAdmin,
    );
  }

  /**
   * Employer views all applicants for a specific job.
   */
  @Get('job/:jobId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getApplicantsForJob(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query() query: QueryApplicationsDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.applicationsService.getApplicantsForJob(user.id, jobId, query, isAdmin);
  }

  /**
   * Employer: Shortlist a candidate for a job.
   */
  @Patch(':id/shortlist')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async shortlistCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ShortlistCandidateDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const application = await this.applicationsService.shortlistCandidate(
      user.id,
      id,
      dto.notes,
      isAdmin,
    );
    return {
      message: 'Candidate shortlisted successfully.',
      application,
    };
  }

  /**
   * Employer updates candidate application status (e.g. reviewed, shortlisted, rejected, hired).
   */
  @Patch(':id/status')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateApplicationStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const application = await this.applicationsService.updateApplicationStatus(
      user.id,
      id,
      dto,
      isAdmin,
    );
    return {
      message: `Application status updated to "${dto.status}".`,
      application,
    };
  }

  /**
   * Candidate withdraws an application.
   */
  @Patch(':id/withdraw')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async withdrawApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.applicationsService.withdrawApplication(user.id, id);
  }

  /**
   * View status change history audit trail for an application.
   */
  @Get(':id/history')
  @UseGuards(AuthGuard)
  async getApplicationHistory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getApplicationHistory(
      user.id,
      id,
      user.role || 'job_seeker',
    );
  }

  /**
   * View details of a specific application.
   */
  @Get(':id')
  @UseGuards(AuthGuard)
  async getApplicationById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getApplicationById(user.id, id, user.role || 'job_seeker');
  }
}
