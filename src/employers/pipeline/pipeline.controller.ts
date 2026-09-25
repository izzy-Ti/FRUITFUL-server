import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
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
import { PipelineService } from './pipeline.service.js';
import {
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
  MoveCandidateDto,
  BatchMoveCandidatesDto,
  UpdateCandidateCardDto,
  QueryPipelineDto,
} from './dto/index.js';

@Controller('employers/pipeline')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER, Role.ADMIN)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  // ==========================================
  // STAGES
  // ==========================================

  /**
   * List custom or default pipeline stages (company-wide or job-specific).
   */
  @Get('stages')
  async getStages(
    @CurrentUser() user: AuthUser,
    @Query('jobId') jobId?: string,
  ) {
    return this.pipelineService.getStages(user, jobId);
  }

  /**
   * Create a new custom pipeline stage.
   */
  @Post('stages')
  async createStage(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStageDto,
  ) {
    return this.pipelineService.createStage(user, dto);
  }

  /**
   * Update an existing custom stage.
   */
  @Patch('stages/:id')
  async updateStage(
    @CurrentUser() user: AuthUser,
    @Param('id') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.pipelineService.updateStage(user, stageId, dto);
  }

  /**
   * Delete a custom hiring stage (with optional candidate migration).
   */
  @Delete('stages/:id')
  async deleteStage(
    @CurrentUser() user: AuthUser,
    @Param('id') stageId: string,
    @Query('migrationStageId') migrationStageId?: string,
  ) {
    return this.pipelineService.deleteStage(user, stageId, migrationStageId);
  }

  /**
   * Reorder stages for column positioning.
   */
  @Put('stages/reorder')
  async reorderStages(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReorderStagesDto,
    @Query('jobId') jobId?: string,
  ) {
    return this.pipelineService.reorderStages(user, dto, jobId);
  }

  /**
   * Reset stages back to standard platform defaults.
   */
  @Post('stages/reset-defaults')
  async resetDefaultStages(
    @CurrentUser() user: AuthUser,
    @Query('jobId') jobId?: string,
  ) {
    return this.pipelineService.resetDefaultStages(user, jobId);
  }

  // ==========================================
  // KANBAN BOARD & CANDIDATE TRANSITIONS
  // ==========================================

  /**
   * Retrieve full visual Kanban board for a job posting.
   */
  @Get('jobs/:jobId')
  async getKanbanBoard(
    @CurrentUser() user: AuthUser,
    @Param('jobId') jobId: string,
    @Query() query: QueryPipelineDto,
  ) {
    return this.pipelineService.getKanbanBoard(user, jobId, query);
  }

  /**
   * Move a candidate to a new pipeline stage.
   */
  @Patch('applications/:id/move')
  async moveCandidate(
    @CurrentUser() user: AuthUser,
    @Param('id') applicationId: string,
    @Body() dto: MoveCandidateDto,
  ) {
    return this.pipelineService.moveCandidate(user, applicationId, dto);
  }

  /**
   * Bulk move multiple candidates to a target stage.
   */
  @Post('batch-move')
  async batchMoveCandidates(
    @CurrentUser() user: AuthUser,
    @Body() dto: BatchMoveCandidatesDto,
  ) {
    return this.pipelineService.batchMoveCandidates(user, dto);
  }

  /**
   * Update candidate card details (ratings, tags, notes).
   */
  @Patch('applications/:id/card')
  async updateCandidateCard(
    @CurrentUser() user: AuthUser,
    @Param('id') applicationId: string,
    @Body() dto: UpdateCandidateCardDto,
  ) {
    return this.pipelineService.updateCandidateCard(user, applicationId, dto);
  }
}
