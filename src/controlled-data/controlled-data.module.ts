import { Module } from '@nestjs/common';
import { ControlledDataService } from './controlled-data.service.js';
import { ControlledDataController } from './controlled-data.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ControlledDataController],
  providers: [ControlledDataService],
  exports: [ControlledDataService],
})
export class ControlledDataModule {}
