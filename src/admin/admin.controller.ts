import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import {
  QueryUsersDto,
  SuspendUserDto,
  UpdateUserRoleDto,
  ModerateJobDto,
  RejectJobDto,
  ModeratePortfolioDto,
} from './dto/index.js';
import { ModerateTalentDto } from '../job-seekers/dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==========================================
  // OPERATIONAL DASHBOARD
  // ==========================================

  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // ==========================================
  // USER & ACCOUNT MANAGEMENT
  // ==========================================

  @Get('users')
  async listUsers(@Query() query: QueryUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(admin.id, id, dto);
  }

  @Patch('users/:id/suspend')
  async suspendUser(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.adminService.suspendUser(admin.id, id, dto);
  }

  @Patch('users/:id/reactivate')
  async reactivateUser(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ) {
    return this.adminService.reactivateUser(admin.id, id);
  }

  @Patch('users/:id/approve')
  async approveUser(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ) {
    return this.adminService.approveUser(admin.id, id);
  }

  // ==========================================
  // EMPLOYER REVIEW & VERIFICATION
  // ==========================================

  @Get('employers')
  async listEmployers(
    @Query('verificationStatus') verificationStatus?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
  ) {
    const employers = await this.adminService.listEmployers({
      verificationStatus,
      search,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      count: employers.length,
      employers,
    };
  }

  @Get('employers/:id')
  async getEmployerById(@Param('id') id: string) {
    return this.adminService.getEmployerById(id);
  }

  @Patch('employers/:id/verify')
  async verifyEmployer(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body('status') status: 'verified' | 'rejected',
    @Body('rejectionReason') rejectionReason?: string,
  ) {
    const profile = await this.adminService.verifyEmployer(
      admin.id,
      id,
      status,
      rejectionReason,
    );
    return {
      message: `Employer verification status updated to "${status}".`,
      profile,
    };
  }

  // ==========================================
  // JOB APPROVAL, REJECTION & REMOVAL
  // ==========================================

  @Get('jobs')
  async listJobs(@Query() query: any) {
    return this.adminService.listJobs(query);
  }

  @Patch('jobs/:id/approve')
  async approveJob(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto?: ModerateJobDto,
  ) {
    const job = await this.adminService.approveJob(admin.id, id, dto);
    return {
      message: 'Job listing approved and published successfully.',
      job,
    };
  }

  @Patch('jobs/:id/reject')
  async rejectJob(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectJobDto,
  ) {
    const job = await this.adminService.rejectJob(admin.id, id, dto);
    return {
      message: 'Job listing rejected and closed.',
      job,
    };
  }

  @Delete('jobs/:id')
  async removeJob(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ) {
    return this.adminService.removeJob(admin.id, id);
  }

  // ==========================================
  // PROFILE & PORTFOLIO CONTENT MODERATION
  // ==========================================

  @Get('profiles')
  async listTalentProfiles(@Query() query: any) {
    const profiles = await this.adminService.listTalentProfiles(query);
    return {
      count: profiles.length,
      profiles,
    };
  }

  @Patch('profiles/:id/approval')
  async moderateTalentProfile(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModerateTalentDto,
  ) {
    const profile = await this.adminService.moderateTalentProfile(admin.id, id, dto);
    return {
      message: `Talent profile status updated to "${dto.approvalStatus}".`,
      profile,
    };
  }

  @Get('portfolio')
  async listPortfolioProjects(
    @Query('moderationStatus') moderationStatus?: string,
    @Query('limit') limit?: number,
  ) {
    const projects = await this.adminService.listPortfolioProjects({
      moderationStatus,
      limit: limit ? Number(limit) : undefined,
    });
    return {
      count: projects.length,
      projects,
    };
  }

  @Patch('portfolio/:id/moderate')
  async moderatePortfolioProject(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ModeratePortfolioDto,
  ) {
    return this.adminService.moderatePortfolioProject(admin.id, id, dto);
  }

  @Delete('portfolio/:id')
  async removePortfolioProject(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ) {
    return this.adminService.removePortfolioProject(admin.id, id);
  }

  // ==========================================
  // ACTIVITY & EMPLOYMENT IMPACT METRICS
  // ==========================================

  @Get('metrics/activity')
  async getPlatformActivityMetrics() {
    return this.adminService.getPlatformActivityMetrics();
  }

  @Get('metrics/employment-impact')
  async getEmploymentImpactMetrics() {
    return this.adminService.getEmploymentImpactMetrics();
  }

  // ==========================================
  // OPERATIONAL REPORTS EXPORT
  // ==========================================

  @Get('reports/available')
  getAvailableReports() {
    return this.adminService.getAvailableReports();
  }

  @Get('reports/export')
  async exportReport(
    @Query('type') type: string,
    @Query('format') format?: 'csv' | 'json',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('category') category?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    if (!type) {
      throw new BadRequestException('Query parameter "type" is required for exporting reports.');
    }
    const result = await this.adminService.exportReport(type, format || 'csv', {
      startDate,
      endDate,
      status,
      role,
      category,
      verificationStatus,
    });

    if (result.format === 'csv') {
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      }
      return result.content;
    }

    return result;
  }

  // ==========================================
  // CATEGORIES MANAGEMENT
  // ==========================================

  @Get('categories')
  async listCategories(@Query() query?: any) {
    const categories = await this.adminService.listCategories(query);
    return {
      count: categories.length,
      categories,
    };
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: any) {
    const category = await this.adminService.createCategory(dto);
    return {
      message: 'Category successfully created.',
      category,
    };
  }

  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() dto: any) {
    const category = await this.adminService.updateCategory(id, dto);
    return {
      message: 'Category successfully updated.',
      category,
    };
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }

  @Post('categories/seed')
  async seedCategories() {
    return this.adminService.seedCategories();
  }

  // ==========================================
  // SKILLS MANAGEMENT
  // ==========================================

  @Get('skills')
  async listSkills(@Query() query?: any) {
    const skills = await this.adminService.listSkills(query);
    return {
      count: skills.length,
      skills,
    };
  }

  @Post('skills')
  @HttpCode(HttpStatus.CREATED)
  async createSkill(@Body() dto: any) {
    const skill = await this.adminService.createSkill(dto);
    return {
      message: 'Skill successfully created.',
      skill,
    };
  }

  @Patch('skills/:id')
  async updateSkill(@Param('id') id: string, @Body() dto: any) {
    const skill = await this.adminService.updateSkill(id, dto);
    return {
      message: 'Skill successfully updated.',
      skill,
    };
  }

  @Delete('skills/:id')
  async deleteSkill(@Param('id') id: string) {
    return this.adminService.deleteSkill(id);
  }

  @Post('skills/seed')
  async seedSkills() {
    return this.adminService.seedSkills();
  }

  // ==========================================
  // CONTROLLED PLATFORM DATA MANAGEMENT
  // ==========================================

  @Get('controlled-data')
  async listControlledData(@Query() query?: any) {
    const items = await this.adminService.listControlledData(query);
    return {
      count: items.length,
      items,
    };
  }

  @Post('controlled-data')
  @HttpCode(HttpStatus.CREATED)
  async createControlledData(@Body() dto: any) {
    const item = await this.adminService.createControlledData(dto);
    return {
      message: 'Controlled platform data item successfully created.',
      item,
    };
  }

  @Patch('controlled-data/:id')
  async updateControlledData(@Param('id') id: string, @Body() dto: any) {
    const item = await this.adminService.updateControlledData(id, dto);
    return {
      message: 'Controlled platform data item successfully updated.',
      item,
    };
  }

  @Delete('controlled-data/:id')
  async deleteControlledData(
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    const forceBool = force === 'true';
    return this.adminService.deleteControlledData(id, forceBool);
  }

  @Post('controlled-data/seed')
  async seedControlledData() {
    return this.adminService.seedControlledData();
  }
}

