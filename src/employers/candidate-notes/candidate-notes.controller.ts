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
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { CandidateNotesService } from './candidate-notes.service.js';
import {
  CreateCandidateNoteDto,
  UpdateCandidateNoteDto,
  QueryCandidateNotesDto,
} from './dto/index.js';

@Controller('employers/candidates')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER, Role.ADMIN)
export class CandidateNotesController {
  constructor(private readonly notesService: CandidateNotesService) {}

  /**
   * Create an evaluation or interview note for a candidate.
   */
  @Post('notes')
  async createNote(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCandidateNoteDto,
  ) {
    return this.notesService.createNote(user, dto);
  }

  /**
   * List all notes written by this employer for a specific candidate.
   */
  @Get(':profileId/notes')
  async listNotes(
    @CurrentUser() user: AuthUser,
    @Param('profileId') profileId: string,
    @Query() query: QueryCandidateNotesDto,
  ) {
    return this.notesService.listNotes(user, profileId, query);
  }

  /**
   * Get single candidate note by ID.
   */
  @Get('notes/:id')
  async getNoteById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notesService.getNoteById(user, id);
  }

  /**
   * Update a candidate note.
   */
  @Patch('notes/:id')
  async updateNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateNoteDto,
  ) {
    return this.notesService.updateNote(user, id, dto);
  }

  /**
   * Delete a candidate note.
   */
  @Delete('notes/:id')
  async deleteNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notesService.deleteNote(user, id);
  }

  /**
   * Toggle pinned status on a candidate note.
   */
  @Patch('notes/:id/pin')
  async togglePinNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notesService.togglePinNote(user, id);
  }
}
