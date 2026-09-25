import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { EmailService } from './email.service.js';
import { NotificationsController } from './notifications.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
