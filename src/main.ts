import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule, ObserveInstrument } from './app.module.js';
import {
  GlobalExceptionFilter,
  createGlobalValidationPipe,
  TransformInterceptor,
} from './common/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    ...(process.env.OBSERVE_APP_KEY ? { instrument: ObserveInstrument } : {}),
  });

  app.use(cookieParser());

  // Global validation pipe with detailed structured errors
  app.useGlobalPipes(createGlobalValidationPipe());

  // Global exception filter for unified error response structure
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Standardized API response format { success, statusCode, data, timestamp }
  app.useGlobalInterceptors(new TransformInterceptor());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
await bootstrap();
