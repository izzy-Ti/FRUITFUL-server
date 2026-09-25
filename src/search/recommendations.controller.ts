import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { RecommendationsService } from './recommendations.service.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { NotFoundException } from '@nestjs/common';

@Controller('recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================================
  // JOB RECOMMENDATIONS FOR A JOB SEEKER (based on their own profile)
  // =========================================================================

  /**
   * GET /recommendations/jobs
   * Returns jobs ranked by fit for the authenticated job seeker's profile.
   */
  @Get('jobs')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async recommendedJobs(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('radiusKm', new DefaultValuePipe(100), ParseIntPipe) radiusKm: number,
    @Query('includeRemote', new DefaultValuePipe('true')) includeRemoteRaw: string,
  ) {
    const includeRemote = includeRemoteRaw !== 'false';

    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();
    if (!profile) {
      throw new NotFoundException('Job seeker profile not found. Please create your profile first.');
    }

    const recommendations = await this.recommendationsService.recommendJobsForSeeker(
      profile.id,
      { limit: Math.min(limit, 50), radiusKm, includeRemote },
    );

    return {
      total: recommendations.length,
      recommendations: recommendations.map(({ job, score, reasons }) => ({
        ...job,
        recommendationScore: score,
        recommendationReasons: reasons,
      })),
    };
  }

  // =========================================================================
  // CANDIDATE RECOMMENDATIONS FOR AN EMPLOYER'S JOB
  // =========================================================================

  /**
   * GET /recommendations/candidates/:jobId
   * Returns ranked candidates most suited for the given job.
   * Restricted to the employer who owns the job.
   */
  @Get('candidates/:jobId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  async recommendedCandidates(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('radiusKm', new DefaultValuePipe(100), ParseIntPipe) radiusKm: number,
    @Query('includeRemote', new DefaultValuePipe('true')) includeRemoteRaw: string,
  ) {
    const includeRemote = includeRemoteRaw !== 'false';

    // Verify the job belongs to this employer
    const employerProfile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();
    if (!employerProfile) {
      throw new NotFoundException('Employer profile not found.');
    }

    const job = await this.prisma.client.orm.public.Job.first({ id: jobId });
    if (!job || (job as any).employerId !== employerProfile.id) {
      throw new NotFoundException('Job not found or does not belong to your account.');
    }

    const recommendations = await this.recommendationsService.recommendCandidatesForJob(
      jobId,
      { limit: Math.min(limit, 50), radiusKm, includeRemote },
    );

    return {
      jobId,
      total: recommendations.length,
      recommendations: recommendations.map(({ profile, score, reasons }) => ({
        ...profile,
        recommendationScore: score,
        recommendationReasons: reasons,
      })),
    };
  }

  // =========================================================================
  // SIMILAR JOBS
  // =========================================================================

  /**
   * GET /recommendations/similar-jobs/:jobId
   * Returns jobs similar to the given one — for "Related Jobs" sections.
   * Public endpoint (no auth required).
   */
  @Get('similar-jobs/:jobId')
  async similarJobs(
    @Param('jobId') jobId: string,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
  ) {
    const similar = await this.recommendationsService.findSimilarJobs(
      jobId,
      Math.min(limit, 20),
    );

    return {
      jobId,
      total: similar.length,
      similarJobs: similar.map(({ job, score, reasons }) => ({
        ...job,
        similarityScore: score,
        similarityReasons: reasons,
      })),
    };
  }
}
