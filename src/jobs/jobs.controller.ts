import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ==========================================
  // PUBLIC / CANDIDATE BROWSING & SEARCH
  // ==========================================

  /**
   * Search published job listings.
   * Requires authentication. Ranks jobs by profile relevance for candidates.
   */
  @Get()
  @UseGuards(OptionalAuthGuard)
  async findPublicJobs(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: QueryJobsDto,
  ) {
    return this.jobsService.findPublicJobs(query, user);
  }

  // ==========================================
  // EMPLOYER JOB MANAGEMENT
  // ==========================================

  /**
   * Get all job listings created by the logged-in employer.
   */
  @Get('employer/my-jobs')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getMyJobs(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    const jobs = await this.jobsService.getMyJobs(user.id, status);
    return {
      count: jobs.length,
      jobs,
    };
  }

  // ==========================================
  // ADMIN JOB MANAGEMENT
  // ==========================================

  /**
   * Admin: List all jobs across employers with status filtering.
   */
  @Get('admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAllAdmin(@Query() query: QueryJobsDto) {
    return this.jobsService.findAllAdmin(query);
  }

  // ==========================================
  // INDIVIDUAL JOB ENDPOINTS
  // ==========================================

  /**
   * Retrieve a specific job by ID (public if published, restricted if draft/closed).
   */
  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async getJobById(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.jobsService.getJobById(id, user);
  }

  /**
   * Employer: Post a new job.
   */
  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createJob(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobDto,
  ) {
    const job = await this.jobsService.createJob(user.id, dto);
    return {
      message: 'Job listing created successfully.',
      job,
    };
  }

  /**
   * Employer: Update an existing job.
   */
  @Put(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const job = await this.jobsService.updateJob(user.id, id, dto, isAdmin);
    return {
      message: 'Job listing updated successfully.',
      job,
    };
  }

  /**
   * Employer: Publish a job.
   */
  @Patch(':id/publish')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async publishJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const job = await this.jobsService.publishJob(user.id, id, isAdmin);
    return {
      message: 'Job published successfully.',
      job,
    };
  }

  /**
   * Employer: Close a job.
   */
  @Patch(':id/close')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async closeJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    const job = await this.jobsService.closeJob(user.id, id, isAdmin);
    return {
      message: 'Job closed successfully.',
      job,
    };
  }

  /**
   * Employer: Delete a job.
   */
  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async deleteJob(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const isAdmin = user.role === Role.ADMIN;
    return this.jobsService.deleteJob(user.id, id, isAdmin);
  }
}
