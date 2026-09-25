import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service.js';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import {
  QueryAnalyticsDto,
  ExportAnalyticsDto,
  QueryJobBenchmarkDto,
} from './dto/index.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Main Hiring Analytics Overview / Dashboard.
   * Executive KPIs, funnel conversion rates, timeline volume trends, time-to-hire, and job metrics.
   */
  @Get(['employers/analytics', 'employers/analytics/overview'])
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getOverviewAnalytics(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getOverviewAnalytics(user, query);
  }

  /**
   * Dedicated Time-to-Hire and Time-to-Fill deep dive with stage durations & bottleneck detection.
   */
  @Get('employers/analytics/time-to-hire')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getTimeToHire(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getTimeToHireAnalytics(user, query);
  }

  /**
   * Recruitment Pipeline Stage Conversion Funnel with drop-off analytics.
   */
  @Get('employers/analytics/funnel')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getPipelineFunnel(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getPipelineFunnelAnalytics(user, query);
  }

  /**
   * Comparative Job Benchmarking & Performance Scorecard.
   */
  @Get('employers/analytics/jobs')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getJobBenchmarks(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryJobBenchmarkDto,
  ) {
    return this.analyticsService.getJobBenchmarkAnalytics(user, query);
  }

  /**
   * Detailed Interview Analytics (completion rates, ratings distribution, format breakdown).
   */
  @Get('employers/analytics/interviews')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getInterviewAnalytics(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryAnalyticsDto,
  ) {
    return this.analyticsService.getInterviewAnalytics(user, query);
  }

  /**
   * Export comprehensive Hiring Analytics Report as CSV or JSON.
   */
  @Get('employers/analytics/export')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async exportAnalytics(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportAnalyticsDto,
    @Res() res: Response,
  ) {
    const result = await this.analyticsService.exportAnalyticsReport(user, query);

    if (query?.format === 'json') {
      return res.json(result);
    }

    const filename = `fruitful-hiring-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(result);
  }
}
