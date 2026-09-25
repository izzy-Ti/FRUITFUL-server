import { describe, it, expect, vi } from 'vitest';
import { SecurityHeadersMiddleware } from './security-headers.middleware.js';

describe('SecurityHeadersMiddleware', () => {
  it('should set essential security headers and remove X-Powered-By', () => {
    const middleware = new SecurityHeadersMiddleware();
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: vi.fn((key: string, val: string) => {
        headers[key.toLowerCase()] = val;
      }),
      removeHeader: vi.fn(),
    };
    const next = vi.fn();

    middleware.use({} as any, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none';",
    );
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalled();
  });
});
