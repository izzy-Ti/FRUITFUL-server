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
import { SavedSearchesService } from './saved-searches.service.js';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto.js';
import { UpdateSavedSearchDto } from './dto/update-saved-search.dto.js';
import { QuerySavedSearchesDto } from './dto/query-saved-searches.dto.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('saved-searches')
@UseGuards(AuthGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  /**
   * Save a new job or talent search with optional alert settings.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSavedSearchDto,
  ) {
    const saved = await this.savedSearchesService.create(user.id, dto);
    return {
      message: 'Search saved successfully.',
      savedSearch: saved,
    };
  }

  /**
   * List the current user's saved searches (paginated, filterable by type and active state).
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QuerySavedSearchesDto,
  ) {
    return this.savedSearchesService.findAll(user.id, query);
  }

  /**
   * Get a single saved search by ID (must belong to the calling user).
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.savedSearchesService.findOne(user.id, id);
  }

  /**
   * Update a saved search's title, filters, alert frequency, or active state.
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavedSearchDto,
  ) {
    const updated = await this.savedSearchesService.update(user.id, id, dto);
    return {
      message: 'Saved search updated successfully.',
      savedSearch: updated,
    };
  }

  /**
   * Delete a saved search.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.savedSearchesService.remove(user.id, id);
  }
}
