import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { MessagesController } from './messages.controller.js';
import { MessagesAdminController } from './messages-admin.controller.js';
import { MessagesService } from './messages.service.js';
import { MessagesGateway } from './messages.gateway.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => StorageModule),
  ],
  controllers: [MessagesController, MessagesAdminController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
