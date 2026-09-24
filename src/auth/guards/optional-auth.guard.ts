import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.headers['cookie'];
    const authorization = request.headers['authorization'];
    const origin =
      request.headers['origin'] ||
      `${request.headers['x-forwarded-proto'] || request.protocol || 'http'}://${request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3000'}`;

    if (!cookies && !authorization) {
      (request as any).user = null;
      (request as any).session = null;
      return true;
    }

    try {
      const sessionData = await this.authService.getSession(cookies, authorization, origin);
      (request as any).user = sessionData?.user || null;
      (request as any).session = sessionData?.session || null;
    } catch {
      (request as any).user = null;
      (request as any).session = null;
    }

    return true;
  }
}
