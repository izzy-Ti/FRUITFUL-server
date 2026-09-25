import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiterMiddleware } from './rate-limiter.middleware.js';

describe('RateLimiterMiddleware', () => {
  let middleware: RateLimiterMiddleware;

  beforeEach(() => {
    middleware = new RateLimiterMiddleware();
    middleware.clear();
  });

  it('should allow requests within rate limits and attach rate limit headers', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req: any = { ip: '10.0.0.1', path: '/jobs' };
    const res: any = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 120);

    process.env.NODE_ENV = originalEnv;
  });

  it('should block requests that exceed limit with HTTP 429 Too Many Requests', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const req: any = { ip: '192.168.1.100', path: '/auth/login' }; // sensitive endpoint, limit: 25
    const res: any = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    // Hit 25 times
    for (let i = 0; i < 25; i++) {
      middleware.use(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(25);

    // 26th hit should be blocked
    middleware.use(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        error: 'Too Many Requests',
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });
});
