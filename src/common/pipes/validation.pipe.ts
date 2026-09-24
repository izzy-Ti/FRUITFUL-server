import { ValidationPipe, BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

export const createGlobalValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (validationErrors: ValidationError[] = []) => {
      const formattedErrors = validationErrors.map((err) => ({
        field: err.property,
        errors: Object.values(err.constraints || {}),
      }));

      return new BadRequestException({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Request payload validation failed',
        errors: formattedErrors,
      });
    },
  });
