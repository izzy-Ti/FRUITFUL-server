import {
  Controller,
  Get,
  Put,
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
import { JobSeekersService } from './job-seekers.service.js';
import {
  UpsertProfileDto,
  CreateEducationDto,
  UpdateEducationDto,
  CreateExperienceDto,
  UpdateExperienceDto,
  AssignSkillDto,
  BatchAssignSkillsDto,
  UpdateSkillAssignmentDto,
  CreatePortfolioProjectDto,
  UpdatePortfolioProjectDto,
  QueryTalentDto,
  ModerateTalentDto,
} from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('job-seekers')
export class JobSeekersController {
  constructor(private readonly jobSeekersService: JobSeekersService) {}

  // ==========================================
  // PROFILE ENDPOINTS
  // ==========================================

  @Get('profile/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async getMyProfile(@CurrentUser() user: AuthUser) {
    return this.jobSeekersService.getFullProfileByUserId(user.id);
  }

  @Put('profile/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertProfileDto,
  ) {
    const profile = await this.jobSeekersService.upsertProfile(user.id, dto);
    return {
      message: 'Profile updated successfully.',
      profile,
    };
  }

  @Get('profile/:id')
  @UseGuards(AuthGuard)
  async getProfileById(
    @Param('id') id: string,
    @CurrentUser() viewer: AuthUser,
  ) {
    return this.jobSeekersService.getFullProfileById(id, viewer);
  }

  @Get()
  @UseGuards(AuthGuard)
  async searchTalent(
    @CurrentUser() viewer: AuthUser,
    @Query() query?: QueryTalentDto,
    legacyLocation?: string,
    legacyIsAvailable?: string,
    legacyLimit?: number,
  ) {
    let dto: QueryTalentDto;
    if (typeof query === 'string') {
      dto = {
        search: query,
        location: legacyLocation,
        isAvailable: legacyIsAvailable !== undefined ? legacyIsAvailable === 'true' : undefined,
        limit: legacyLimit ? Number(legacyLimit) : undefined,
      };
    } else {
      dto = query || {};
    }

    const results = await this.jobSeekersService.searchTalent({
      ...dto,
      viewerRole: viewer?.role,
    });
    return {
      count: results.length,
      jobSeekers: results,
    };
  }

  @Get('discovery')
  @UseGuards(AuthGuard)
  async discoverTalent(
    @CurrentUser() viewer: AuthUser,
    @Query() query?: QueryTalentDto,
  ) {
    return this.searchTalent(viewer, query);
  }

  @Patch('profile/:id/approval')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async moderateProfileApproval(
    @CurrentUser() admin: AuthUser,
    @Param('id') profileId: string,
    @Body() dto: ModerateTalentDto,
  ) {
    const profile = await this.jobSeekersService.moderateTalentProfile(
      admin.id,
      profileId,
      dto,
    );
    return {
      message: `Profile status updated to ${dto.approvalStatus}.`,
      profile,
    };
  }

  // ==========================================
  // EDUCATION ENDPOINTS
  // ==========================================

  @Get('education')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getEducationList(@CurrentUser() user: AuthUser) {
    const records = await this.jobSeekersService.getEducationList(user.id);
    return {
      count: records.length,
      education: records,
    };
  }

  @Post('education')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async addEducation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEducationDto,
  ) {
    const record = await this.jobSeekersService.addEducation(user.id, dto);
    return {
      message: 'Education record successfully added.',
      record,
    };
  }

  @Put('education/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async updateEducation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEducationDto,
  ) {
    const record = await this.jobSeekersService.updateEducation(user.id, id, dto);
    return {
      message: 'Education record successfully updated.',
      record,
    };
  }

  @Delete('education/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async deleteEducation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.jobSeekersService.deleteEducation(user.id, id);
  }

  // ==========================================
  // EXPERIENCE ENDPOINTS
  // ==========================================

  @Get('experience')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getExperienceList(@CurrentUser() user: AuthUser) {
    const records = await this.jobSeekersService.getExperienceList(user.id);
    return {
      count: records.length,
      experience: records,
    };
  }

  @Post('experience')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async addExperience(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateExperienceDto,
  ) {
    const record = await this.jobSeekersService.addExperience(user.id, dto);
    return {
      message: 'Experience record successfully added.',
      record,
    };
  }

  @Put('experience/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async updateExperience(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    const record = await this.jobSeekersService.updateExperience(user.id, id, dto);
    return {
      message: 'Experience record successfully updated.',
      record,
    };
  }

  @Delete('experience/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async deleteExperience(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.jobSeekersService.deleteExperience(user.id, id);
  }

  // ==========================================
  // SKILLS ASSIGNMENT ENDPOINTS
  // ==========================================

  @Get('skills')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getAssignedSkills(@CurrentUser() user: AuthUser) {
    const skills = await this.jobSeekersService.getAssignedSkills(user.id);
    return {
      count: skills.length,
      skills,
    };
  }

  @Post('skills')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async assignSkill(
    @CurrentUser() user: AuthUser,
    @Body() dto: AssignSkillDto,
  ) {
    return this.jobSeekersService.assignSkill(user.id, dto);
  }

  @Post('skills/batch')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async batchAssignSkills(
    @CurrentUser() user: AuthUser,
    @Body() dto: BatchAssignSkillsDto,
  ) {
    const assignments = await this.jobSeekersService.batchAssignSkills(user.id, dto.skills);
    return {
      message: `${assignments.length} skills successfully processed.`,
      assignments,
    };
  }

  @Put('skills/:skillId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async updateSkillAssignment(
    @CurrentUser() user: AuthUser,
    @Param('skillId') skillId: string,
    @Body() dto: UpdateSkillAssignmentDto,
  ) {
    const updated = await this.jobSeekersService.updateSkillAssignment(user.id, skillId, dto);
    return {
      message: 'Skill assignment updated successfully.',
      assignment: updated,
    };
  }

  @Delete('skills/:skillId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async removeSkill(
    @CurrentUser() user: AuthUser,
    @Param('skillId') skillId: string,
  ) {
    return this.jobSeekersService.removeSkill(user.id, skillId);
  }

  // ==========================================
  // PORTFOLIO ENDPOINTS
  // ==========================================

  @Get('portfolio')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async getPortfolioProjects(@CurrentUser() user: AuthUser) {
    const projects = await this.jobSeekersService.getPortfolioProjects(user.id);
    return {
      count: projects.length,
      projects,
    };
  }

  @Post('portfolio')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  @HttpCode(HttpStatus.CREATED)
  async addPortfolioProject(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePortfolioProjectDto,
  ) {
    const project = await this.jobSeekersService.addPortfolioProject(user.id, dto);
    return {
      message: 'Portfolio project added successfully.',
      project,
    };
  }

  @Get('portfolio/:id')
  @UseGuards(AuthGuard)
  async getPortfolioProjectById(@Param('id') id: string) {
    return this.jobSeekersService.getPortfolioProjectById(id);
  }

  @Put('portfolio/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async updatePortfolioProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioProjectDto,
  ) {
    const project = await this.jobSeekersService.updatePortfolioProject(user.id, id, dto);
    return {
      message: 'Portfolio project updated successfully.',
      project,
    };
  }

  @Delete('portfolio/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.JOB_SEEKER)
  async deletePortfolioProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.jobSeekersService.deletePortfolioProject(user.id, id);
  }
}

