import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
