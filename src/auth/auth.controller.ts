import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/index.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractOrigin(req: Request, headerOrigin?: string): string {
    if (headerOrigin) return headerOrigin;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    return `${proto}://${host}`;
  }

  private applySetCookieHeaders(res: Response, cookies?: string[]) {
    if (cookies && cookies.length > 0) {
      res.setHeader('Set-Cookie', cookies);
    }
  }

  @Post(['register', 'sign-up'])
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') headerOrigin?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const result = await this.authService.register(dto, origin);
    this.applySetCookieHeaders(res, result.setCookieHeaders);

    return {
      success: true,
      message: 'Account successfully registered.',
      ...result.data,
    };
  }

  @Post(['login', 'sign-in'])
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') headerOrigin?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const result = await this.authService.login(dto, origin);
    this.applySetCookieHeaders(res, result.setCookieHeaders);

    return {
      success: true,
      message: 'Login successful.',
      ...result.data,
    };
  }

  @Post(['logout', 'sign-out'])
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') headerOrigin?: string,
    @Headers('cookie') cookies?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const result = await this.authService.logout(cookies, authorization, origin);
    this.applySetCookieHeaders(res, result.setCookieHeaders);

    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }

  @Post(['forgot-password', 'request-password-reset'])
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
    @Headers('origin') headerOrigin?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const result = await this.authService.forgotPassword(dto, origin);

    return {
      success: true,
      message:
        result?.message || 'If this email exists in our system, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Headers('origin') headerOrigin?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const result = await this.authService.resetPassword(dto, origin);

    return {
      success: true,
      message: result?.message || 'Password has been reset successfully.',
    };
  }

  @Get(['me', 'session'])
  async getSession(
    @Req() req: Request,
    @Headers('origin') headerOrigin?: string,
    @Headers('cookie') cookies?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const origin = this.extractOrigin(req, headerOrigin);
    const sessionData = await this.authService.getSession(cookies, authorization, origin);

    if (!sessionData?.user) {
      throw new UnauthorizedException('Not authenticated or session expired');
    }

    return {
      authenticated: true,
      user: sessionData.user,
      session: sessionData.session,
    };
  }
}
