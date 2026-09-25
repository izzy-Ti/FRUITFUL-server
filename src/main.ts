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

  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
      }
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
await bootstrap();
