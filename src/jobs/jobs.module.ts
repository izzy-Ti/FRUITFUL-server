import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { SearchModule } from '../search/index.js';

@Module({
  imports: [AuthModule, SearchModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
