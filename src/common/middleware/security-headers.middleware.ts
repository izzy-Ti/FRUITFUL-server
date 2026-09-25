import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Prevent Clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // 3. XSS Filter protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // 4. Enforce HTTPS in production via HSTS
    if (process.env.NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    }

    // 5. Control Referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 6. Content Security Policy (API service baseline)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none';",
    );

    // 7. Permissions policy restricting sensitive hardware access
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // 8. Remove fingerprinting header
    res.removeHeader('X-Powered-By');

    next();
  }
}
