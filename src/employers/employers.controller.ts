import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmployersService } from './employers.service.js';
import {
  UpsertEmployerProfileDto,
  VerifyEmployerDto,
  QueryEmployersDto,
} from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('employers')
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  // ==========================================
  // EMPLOYER SELF-SERVICE ENDPOINTS
  // ==========================================

  @Get('profile/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getMyProfile(@CurrentUser() user: AuthUser) {
    const profile = await this.employersService.getMyProfile(user.id);
    return {
      profile,
    };
  }

  @Put('profile/me')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  async updateMyProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertEmployerProfileDto,
  ) {
    const profile = await this.employersService.upsertProfile(user.id, dto);
    return {
      message: 'Employer organization profile updated successfully.',
      profile,
    };
  }

  @Post('profile/request-verification')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  @HttpCode(HttpStatus.OK)
  async requestVerification(@CurrentUser() user: AuthUser) {
    const profile = await this.employersService.requestVerification(user.id);
    return {
      message: 'Organization verification request submitted to administrators.',
      profile,
    };
  }

  @Get('profile/me/verification-history')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.EMPLOYER)
  async getMyVerificationHistory(@CurrentUser() user: AuthUser) {
    const profile = await this.employersService.getMyProfile(user.id);
    if (!profile) {
      return { history: [] };
    }
    const history = await this.employersService.getVerificationHistory(profile.id);
    return {
      employerId: profile.id,
      history,
    };
  }

  // ==========================================
  // PUBLIC / DIRECTORY ENDPOINTS
  // ==========================================

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Query() query: QueryEmployersDto) {
    const employers = await this.employersService.findAll(query);
    return {
      count: employers.length,
      employers,
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async findOne(@Param('id') id: string) {
    return this.employersService.getProfileById(id);
  }

  // ==========================================
  // ADMIN VERIFICATION ENDPOINTS
  // ==========================================

  @Get('admin/all')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAllAdmin(@Query() query: QueryEmployersDto) {
    const employers = await this.employersService.findAllAdmin(query);
    return {
      count: employers.length,
      employers,
    };
  }

  @Patch('admin/:id/verify')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateVerification(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerifyEmployerDto,
  ) {
    const profile = await this.employersService.updateVerificationStatus(id, dto, user.id);
    return {
      message: `Employer organization status updated to "${dto.status}".`,
      profile,
    };
  }

  @Get('admin/:id/verification-history')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminVerificationHistory(@Param('id') id: string) {
    const history = await this.employersService.getVerificationHistory(id);
    return {
      employerId: id,
      history,
    };
  }
}
