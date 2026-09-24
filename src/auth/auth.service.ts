import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/index.js';

export interface AuthResponse<T = any> {
  data: T;
  setCookieHeaders?: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  role?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authBaseUrl: string;
  private readonly jwksUrl: string;
  private readonly defaultOrigin: string;
  private jwksClient?: ReturnType<typeof jose.createRemoteJWKSet>;

  constructor(private readonly configService: ConfigService) {
    this.authBaseUrl = this.configService.get<string>('auth.baseUrl') || '';
    this.jwksUrl = this.configService.get<string>('auth.jwksUrl') || '';
    const port = this.configService.get<number>('app.port', 3000);
    this.defaultOrigin = `http://localhost:${port}`;

    if (!this.authBaseUrl) {
      this.logger.warn(
        'NEON_AUTH_BASE_URL is not set. Auth operations against Neon will fail until configured.',
      );
    }

    if (this.jwksUrl) {
      try {
        this.jwksClient = jose.createRemoteJWKSet(new URL(this.jwksUrl));
      } catch (err) {
        this.logger.warn(`Failed to initialize JWKS client: ${err}`);
      }
    }
  }

  /**
   * Internal proxy request helper to communicate with Neon Auth (Better Auth) service.
   */
  private async requestNeonAuth<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: Record<string, any>;
      headers?: Record<string, string>;
      origin?: string;
    } = {},
  ): Promise<{ data: T; headers: Headers }> {
    const url = `${this.authBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const origin = options.origin || this.defaultOrigin;

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Origin: origin,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method: options.method || (options.body ? 'POST' : 'GET'),
        headers: reqHeaders,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const responseText = await response.text();
      let parsedBody: any;
      try {
        parsedBody = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsedBody = { message: responseText };
      }

      if (!response.ok) {
        const errorMessage =
          parsedBody?.message ||
          parsedBody?.error ||
          parsedBody?.code ||
          `Neon Auth request failed with status ${response.status}`;

        if (response.status === 400) {
          throw new BadRequestException(errorMessage);
        } else if (response.status === 401) {
          throw new UnauthorizedException(errorMessage);
        } else {
          throw new InternalServerErrorException(errorMessage);
        }
      }

      return {
        data: parsedBody as T,
        headers: response.headers,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(`Network error reaching Neon Auth at ${url}:`, error);
      throw new InternalServerErrorException(
        'Unable to connect to authentication service. Please verify your connection.',
      );
    }
  }

  /**
   * Register a new user with email and password via Neon Auth.
   */
  async register(
    dto: RegisterDto,
    origin?: string,
  ): Promise<AuthResponse<{ user: AuthUser; token?: string }>> {
    const result = await this.requestNeonAuth<{ user: AuthUser; token?: string }>(
      '/sign-up/email',
      {
        body: {
          email: dto.email,
          password: dto.password,
          name: dto.name,
        },
        origin,
      },
    );

    const setCookies = result.headers.getSetCookie?.() || [];
    return {
      data: result.data,
      setCookieHeaders: setCookies,
    };
  }

  /**
   * Log in with email and password via Neon Auth.
   */
  async login(
    dto: LoginDto,
    origin?: string,
  ): Promise<AuthResponse<{ user: AuthUser; token?: string }>> {
    const result = await this.requestNeonAuth<{ user: AuthUser; token?: string }>(
      '/sign-in/email',
      {
        body: {
          email: dto.email,
          password: dto.password,
        },
        origin,
      },
    );

    const setCookies = result.headers.getSetCookie?.() || [];
    return {
      data: result.data,
      setCookieHeaders: setCookies,
    };
  }

  /**
   * Log out the current user and invalidate the session on Neon Auth.
   */
  async logout(
    cookies?: string,
    authorization?: string,
    origin?: string,
  ): Promise<AuthResponse<{ success: boolean }>> {
    const headers: Record<string, string> = {};
    if (cookies) headers['Cookie'] = cookies;
    if (authorization) headers['Authorization'] = authorization;

    const result = await this.requestNeonAuth<{ success: boolean }>('/sign-out', {
      body: {},
      headers,
      origin,
    });

    const setCookies = result.headers.getSetCookie?.() || [];
    return {
      data: result.data,
      setCookieHeaders: setCookies,
    };
  }

  /**
   * Request a password reset email via Neon Auth.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    origin?: string,
  ): Promise<{ message: string; status: boolean }> {
    const result = await this.requestNeonAuth<{ message: string; status: boolean }>(
      '/request-password-reset',
      {
        body: {
          email: dto.email,
          redirectTo: dto.redirectTo || `${origin || this.defaultOrigin}/auth/reset-password`,
        },
        origin,
      },
    );

    return result.data;
  }

  /**
   * Reset user password using the token received in email.
   */
  async resetPassword(
    dto: ResetPasswordDto,
    origin?: string,
  ): Promise<{ message: string; status: boolean }> {
    const result = await this.requestNeonAuth<{ message: string; status: boolean }>(
      '/reset-password',
      {
        body: {
          token: dto.token,
          newPassword: dto.newPassword,
        },
        origin,
      },
    );

    return result.data;
  }

  /**
   * Retrieve active session and user profile.
   */
  async getSession(
    cookies?: string,
    authorization?: string,
    origin?: string,
  ): Promise<{ user: AuthUser | null; session: AuthSession | null }> {
    const headers: Record<string, string> = {};
    if (cookies) headers['Cookie'] = cookies;
    if (authorization) headers['Authorization'] = authorization;

    const result = await this.requestNeonAuth<{
      user: AuthUser | null;
      session: AuthSession | null;
    }>('/get-session', {
      headers,
      origin,
    });

    return result.data;
  }

  /**
   * Verify an EdDSA JWT issued by Neon Auth using JWKS.
   */
  async verifyJwt(token: string): Promise<jose.JWTPayload | null> {
    if (!this.jwksClient) {
      if (this.jwksUrl) {
        this.jwksClient = jose.createRemoteJWKSet(new URL(this.jwksUrl));
      } else {
        throw new InternalServerErrorException('NEON_AUTH_JWKS_URL is not configured');
      }
    }

    try {
      const { payload } = await jose.jwtVerify(token, this.jwksClient);
      return payload;
    } catch (err) {
      this.logger.warn(`JWT verification failed: ${err}`);
      return null;
    }
  }
}
