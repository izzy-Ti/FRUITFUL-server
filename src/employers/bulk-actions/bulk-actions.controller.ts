import {
  Controller,
  Post,
  Body,
  UseGuards,
  Header,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { BulkActionsService } from './bulk-actions.service.js';
import { BulkCandidateActionDto } from './dto/index.js';

@Controller('employers/candidates')
@UseGuards(AuthGuard, RolesGuard)
@Roles(Role.EMPLOYER, Role.ADMIN)
export class BulkActionsController {
  constructor(private readonly bulkActionsService: BulkActionsService) {}

  /**
   * Execute bulk action across multiple candidates (status update, reject, tag, rate, note, export).
   */
  @Post('bulk-action')
  async executeBulkAction(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkCandidateActionDto,
  ) {
    return this.bulkActionsService.executeBulkAction(user, dto);
  }

  /**
   * Bulk export candidates with CSV format.
   */
  @Post('bulk-export')
  @Header('Content-Type', 'application/json')
  async bulkExport(
    @CurrentUser() user: AuthUser,
    @Body('applicationIds') applicationIds: string[],
  ) {
    return this.bulkActionsService.executeBulkAction(user, {
      action: 'export',
      applicationIds,
    });
  }
}
