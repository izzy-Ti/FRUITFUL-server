import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { OffersService } from './offers.service.js';
import {
  CreateOfferDto,
  UpdateOfferDto,
  RespondOfferDto,
  WithdrawOfferDto,
  QueryOffersDto,
} from './dto/index.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  /**
   * Create an official job offer for an applicant.
   */
  @Post('employers/offers')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async createOffer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOfferDto,
  ) {
    return this.offersService.createOffer(user, dto);
  }

  /**
   * List offers created by this employer.
   */
  @Get('employers/offers')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async listEmployerOffers(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryOffersDto,
  ) {
    return this.offersService.listOffers(user, query);
  }

  /**
   * List offers received by the candidate.
   */
  @Get('job-seekers/offers')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async listCandidateOffers(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryOffersDto,
  ) {
    return this.offersService.listOffers(user, query);
  }

  /**
   * Offer conversion & salary metrics for employer.
   */
  @Get('employers/offers/analytics')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getOfferAnalytics(@CurrentUser() user: AuthUser) {
    return this.offersService.getOfferAnalytics(user);
  }

  /**
   * Get offer details by ID.
   */
  @Get('offers/:id')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  async getOfferById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.offersService.getOfferById(user, id);
  }

  /**
   * Update offer terms (salary, benefits, dates).
   */
  @Patch('employers/offers/:id')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.offersService.updateOffer(user, id, dto);
  }

  /**
   * Send draft offer to the candidate.
   */
  @Post('employers/offers/:id/send')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async sendOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.offersService.sendOffer(user, id);
  }

  /**
   * Candidate accepts or declines job offer.
   */
  @Post('offers/:id/respond')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async respondToOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RespondOfferDto,
  ) {
    return this.offersService.respondToOffer(user, id, dto);
  }

  /**
   * Employer withdraws a job offer.
   */
  @Post('employers/offers/:id/withdraw')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async withdrawOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: WithdrawOfferDto,
  ) {
    return this.offersService.withdrawOffer(user, id, dto);
  }
}
