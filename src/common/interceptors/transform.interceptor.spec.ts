import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { TransformInterceptor } from './transform.interceptor.js';

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  const createMockContext = (statusCode = 200): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should wrap raw response payload in standard structure', async () => {
    const context = createMockContext(200);
    const handler: CallHandler = {
      handle: () => of({ user: { id: 'u1', name: 'John Doe' } }),
    };

    const observable = interceptor.intercept(context, handler);
    observable.subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual({ user: { id: 'u1', name: 'John Doe' } });
      expect(result.timestamp).toBeDefined();
    });
  });

  it('should preserve success flag if already provided', async () => {
    const context = createMockContext(201);
    const handler: CallHandler = {
      handle: () => of({ success: true, message: 'Created', role: 'admin' }),
    };

    const observable = interceptor.intercept(context, handler);
    observable.subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
      expect(result.message).toBe('Created');
      expect(result.role).toBe('admin');
      expect(result.timestamp).toBeDefined();
    });
  });
});
