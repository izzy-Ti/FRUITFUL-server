import { Module } from '@nestjs/common';
import { JobSeekersController } from './job-seekers.controller.js';
import { JobSeekersService } from './job-seekers.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SkillsModule } from '../skills/skills.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, SkillsModule],
  controllers: [JobSeekersController],
  providers: [JobSeekersService],
  exports: [JobSeekersService],
})
export class JobSeekersModule {}
