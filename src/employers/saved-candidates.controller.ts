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
import { SavedCandidatesService } from './saved-candidates.service.js';
import { SaveCandidateDto } from './dto/save-candidate.dto.js';
import { UpdateSavedCandidateDto, QuerySavedCandidatesDto } from './dto/saved-candidates.dto.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('employers/saved-candidates')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER)
export class SavedCandidatesController {
  constructor(private readonly savedCandidatesService: SavedCandidatesService) {}

  /**
   * Save (bookmark) a job seeker profile. Returns 409 if already saved.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async save(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveCandidateDto,
  ) {
    const saved = await this.savedCandidatesService.saveCandidate(user.id, dto);
    return { message: 'Candidate saved successfully.', savedCandidate: saved };
  }

  /**
   * List all saved candidates for the current employer.
   * Optionally filter by tag and paginate.
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QuerySavedCandidatesDto,
  ) {
    return this.savedCandidatesService.findAll(user.id, query);
  }

  /**
   * Get a single saved candidate by saved-candidate record ID.
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.savedCandidatesService.findOne(user.id, id);
  }

  /**
   * Update notes or tags on a saved candidate.
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedCandidateDto,
  ) {
    const updated = await this.savedCandidatesService.update(user.id, id, dto);
    return { message: 'Saved candidate updated.', savedCandidate: updated };
  }

  /**
   * Remove a saved candidate by record ID.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.savedCandidatesService.remove(user.id, id);
  }

  /**
   * Unsave a candidate by profile ID directly.
   * Convenient shorthand when the employer knows the profile ID but not the saved-record ID.
   */
  @Delete('by-profile/:profileId')
  @HttpCode(HttpStatus.OK)
  async removeByProfile(
    @CurrentUser() user: AuthUser,
    @Param('profileId') profileId: string,
  ) {
    return this.savedCandidatesService.removeByProfileId(user.id, profileId);
  }
}
