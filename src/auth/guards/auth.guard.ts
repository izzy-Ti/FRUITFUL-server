import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.headers['cookie'];
    const authorization = request.headers['authorization'];
    const origin =
      request.headers['origin'] ||
      `${request.headers['x-forwarded-proto'] || request.protocol || 'http'}://${request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3000'}`;

    if (!cookies && !authorization) {
      throw new UnauthorizedException('Authentication credentials missing');
    }

    try {
      const sessionData = await this.authService.getSession(cookies, authorization, origin);

      if (!sessionData?.user) {
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Attach user and session to request for downstream use
      (request as any).user = sessionData.user;
      (request as any).session = sessionData.session;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
