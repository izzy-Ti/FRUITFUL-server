import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
}
