import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  errors?: any[];
  timestamp: string;
  path: string;
  method: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred';
    let errors: any[] | undefined = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, any>;
        error = resObj.error || exception.name;
        message = resObj.message || exception.message;
        errors = resObj.errors;
      } else {
        message = String(exceptionResponse);
        error = exception.name;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown exception on ${request.method} ${request.url}`, exception);
    }

    const errorPayload: ErrorResponse = {
      statusCode: status,
      error,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} -> ${status}: ${JSON.stringify(errorPayload)}`,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} -> ${status}: ${JSON.stringify(errorPayload)}`,
      );
    }

    response.status(status).json(errorPayload);
  }
}
