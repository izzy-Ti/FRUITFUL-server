import { Module } from '@nestjs/common';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule],
  controllers: [EmployersController],
  providers: [EmployersService],
  exports: [EmployersService],
})
export class EmployersModule {}
