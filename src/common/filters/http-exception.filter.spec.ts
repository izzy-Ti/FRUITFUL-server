import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect, vi } from 'vitest';
import { GlobalExceptionFilter } from './http-exception.filter.js';

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  const createMockArgumentsHost = () => {
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const response = { status: statusFn };
    const request = { url: '/test-route', method: 'GET' };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusFn, jsonFn };
  };

  it('should format standard HttpException properly', () => {
    const { host, statusFn, jsonFn } = createMockArgumentsHost();
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'HttpException',
        message: 'Forbidden resource',
        path: '/test-route',
        method: 'GET',
      }),
    );
  });

  it('should handle HttpException with structured object response', () => {
    const { host, statusFn, jsonFn } = createMockArgumentsHost();
    const exception = new HttpException(
      {
        error: 'Validation Error',
        message: 'Request payload validation failed',
        errors: [{ field: 'email', errors: ['email must be an email'] }],
      },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Validation Error',
        message: 'Request payload validation failed',
        errors: [{ field: 'email', errors: ['email must be an email'] }],
        path: '/test-route',
        method: 'GET',
      }),
    );
  });

  it('should handle unhandled Error as 500 Internal Server Error', () => {
    const { host, statusFn, jsonFn } = createMockArgumentsHost();
    const exception = new Error('Database connection broke');

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Database connection broke',
        path: '/test-route',
        method: 'GET',
      }),
    );
  });
});
