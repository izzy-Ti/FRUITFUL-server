import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EmployersModule } from '../employers/employers.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { JobSeekersModule } from '../job-seekers/job-seekers.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    DatabaseModule,
    EmployersModule,
    JobsModule,
    JobSeekersModule,
    AuthModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
