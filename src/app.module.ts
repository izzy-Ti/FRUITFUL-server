import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { appConfig, databaseConfig, authConfig, storageConfig } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { JobSeekersModule } from './job-seekers/job-seekers.module.js';
import { EmployersModule } from './employers/employers.module.js';
import { StorageModule } from './storage/storage.module.js';
import { LoggerMiddleware } from './common/index.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, authConfig, storageConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ...(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY,
            appSecret: process.env.OBSERVE_APP_SECRET,
            serviceId: 'server',
          }),
        ]
      : []),
    DatabaseModule,
    AuthModule,
    SkillsModule,
    JobSeekersModule,
    EmployersModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
