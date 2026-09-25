import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private readonly hits = new Map<string, RateLimitRecord>();
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly defaultMaxRequests = 120; // 120 requests per minute for general endpoints
  private readonly sensitiveMaxRequests = 25; // 25 requests per minute for auth and upload endpoints

  use(req: Request, res: Response, next: NextFunction): void {
    // Skip rate limiting during test executions
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const path = req.path || req.originalUrl || '';
    const now = Date.now();

    // Sensitive endpoints have lower rate limits to prevent brute force
    const isSensitive =
      path.includes('/auth/login') ||
      path.includes('/auth/sign-in') ||
      path.includes('/auth/forgot-password') ||
      path.includes('/auth/reset-password') ||
      path.startsWith('/upload');

    const maxAllowed = isSensitive ? this.sensitiveMaxRequests : this.defaultMaxRequests;
    const clientKey = `${ip}:${isSensitive ? 'sensitive' : 'general'}`;

    let record = this.hits.get(clientKey);
    if (!record) {
      record = { timestamps: [] };
      this.hits.set(clientKey, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    const remaining = Math.max(0, maxAllowed - record.timestamps.length);
    res.setHeader('X-RateLimit-Limit', maxAllowed);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + this.windowMs) / 1000));

    if (record.timestamps.length >= maxAllowed) {
      const oldestHit = record.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((this.windowMs - (now - oldestHit)) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);

      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.timestamps.push(now);
    next();
  }

  /**
   * Helper to clear rate limit records for testing.
   */
  clear(): void {
    this.hits.clear();
  }
}
