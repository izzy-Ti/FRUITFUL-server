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
  BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { QueryNotificationsDto, TestDispatchNotificationDto } from './dto/index.js';
import { NotificationType } from './notifications.types.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { AuthUser } from '../auth/auth.service.js';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get current user's notifications with pagination and read status filtering.
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.getUserNotifications(user.id, query);
  }

  /**
   * Get count of unread notifications for current user.
   */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  /**
   * Mark a specific notification as read.
   */
  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const notification = await this.notificationsService.markAsRead(user.id, id);
    return {
      message: 'Notification marked as read.',
      notification,
    };
  }

  /**
   * Mark all notifications as read for current user.
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  /**
   * Delete a notification.
   */
  @Delete(':id')
  async deleteNotification(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.deleteNotification(user.id, id);
  }

  /**
   * Operational testing endpoint for admins to dispatch any of the 6 notification streams on demand.
   */
  @Post('test-dispatch')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async testDispatch(
    @CurrentUser() admin: AuthUser,
    @Body() dto: TestDispatchNotificationDto,
  ) {
    const email = dto.email || admin.email;

    switch (dto.type) {
      case NotificationType.ACCOUNT_VERIFICATION:
        return this.notificationsService.sendAccountVerificationEmail({
          userId: admin.id,
          email,
          name: admin.name || 'Admin',
          verificationUrl: 'https://fruitful.example/verify-email?token=test-token-123',
          otp: '482910',
        });

      case NotificationType.PASSWORD_RESET:
        return this.notificationsService.sendPasswordResetEmail({
          userId: admin.id,
          email,
          name: admin.name || 'Admin',
          resetUrl: 'https://fruitful.example/reset-password?token=test-reset-123',
          token: 'test-reset-123',
        });

      case NotificationType.APPLICATION_RECEIVED:
        return this.notificationsService.sendApplicationReceivedNotification({
          candidateUserId: admin.id,
          candidateEmail: email,
          candidateName: dto.candidateName || 'Test Candidate',
          employerUserId: admin.id,
          employerEmail: email,
          jobTitle: dto.jobTitle || 'Senior Software Engineer',
          companyName: dto.companyName || 'Fruitful Labs',
          applicationId: 'app-test-123',
          jobId: 'job-test-123',
        });

      case NotificationType.APPLICATION_STATUS_CHANGE:
        return this.notificationsService.sendApplicationStatusChangeNotification({
          candidateUserId: admin.id,
          candidateEmail: email,
          candidateName: dto.candidateName || 'Test Candidate',
          jobTitle: dto.jobTitle || 'Senior Software Engineer',
          companyName: dto.companyName || 'Fruitful Labs',
          applicationId: 'app-test-123',
          newStatus: dto.status || 'interviewing',
          previousStatus: 'reviewing',
          employerNotes: 'We were impressed by your profile and portfolio.',
        });

      case NotificationType.EMPLOYER_VERIFICATION:
        return this.notificationsService.sendEmployerVerificationNotification({
          employerUserId: admin.id,
          employerEmail: email,
          companyName: dto.companyName || 'Fruitful Labs',
          status: (dto.status as any) || 'verified',
          rejectionReason: dto.reason || null,
        });

      case NotificationType.ADMIN_MODERATION_ALERT:
        return this.notificationsService.sendAdminModerationAlert({
          adminUserId: admin.id,
          alertType: 'security_alert',
          title: dto.title || 'Security notice: unusual login attempt',
          message: dto.message || 'An administrative action has triggered a security alert.',
          entityType: 'User',
          entityId: admin.id,
        });

      default:
        throw new BadRequestException(`Unrecognized notification type: ${dto.type}`);
    }
  }
}
