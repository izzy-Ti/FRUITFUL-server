import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jose from 'jose';
import { PrismaService } from '../database/prisma.service.js';
import { Role } from '../common/enums/role.enum.js';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SendVerificationEmailDto,
  VerifyEmailDto,
  GoogleAuthDto,
} from './dto/index.js';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
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
   * Helper to synchronize a user profile and role with the database.
   */
  private async syncUserProfile(user: AuthUser, requestedRole?: Role): Promise<void> {
    if (!user?.id) return;
    try {
      const existing = await this.prisma.client.orm.public.User
        .where({ id: user.id })
        .first();

      if (existing) {
        user.role = existing.role;
      } else {
        const assignedRole = requestedRole || Role.JOB_SEEKER;
        await this.prisma.client.orm.public.User.create({
          id: user.id,
          email: user.email,
          name: user.name,
          role: assignedRole,
        });
        user.role = assignedRole;
      }
    } catch (err) {
      this.logger.warn(`Could not sync user profile in database: ${err}`);
      if (!user.role) {
        user.role = requestedRole || Role.JOB_SEEKER;
      }
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
    if (result.data?.user) {
      await this.syncUserProfile(result.data.user, dto.role as Role);
    }

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
    if (result.data?.user) {
      await this.syncUserProfile(result.data.user);
    }

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

    if (result.data?.user) {
      await this.syncUserProfile(result.data.user);
    }

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

  /**
   * Send an email verification link or code to the user's email address.
   */
  async sendVerificationEmail(
    dto: SendVerificationEmailDto,
    origin?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.requestNeonAuth('/send-verification-email', {
      body: {
        email: dto.email,
      },
      origin,
    });

    return {
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    };
  }

  /**
   * Send an email verification OTP code.
   */
  async sendVerificationOtp(
    email: string,
    origin?: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.requestNeonAuth('/email-otp/send-verification-otp', {
      body: {
        email,
        type: 'email-verification',
      },
      origin,
    });

    return {
      success: true,
      message: 'Verification code sent. Please check your inbox.',
    };
  }

  /**
   * Verify an email address using either a link token or an OTP code.
   */
  async verifyEmail(
    dto: VerifyEmailDto,
    origin?: string,
  ): Promise<{ success: boolean; message: string; user?: AuthUser }> {
    if (dto.token) {
      const result = await this.requestNeonAuth<{ status: boolean; user?: AuthUser }>(
        `/verify-email?token=${encodeURIComponent(dto.token)}`,
        {
          method: 'GET',
          origin,
        },
      );
      return {
        success: true,
        message: 'Email successfully verified.',
        user: result.data.user,
      };
    }

    if (dto.email && dto.otp) {
      const result = await this.requestNeonAuth<{ user?: AuthUser }>(
        '/email-otp/verify-email',
        {
          body: {
            email: dto.email,
            otp: dto.otp,
          },
          origin,
        },
      );
      return {
        success: true,
        message: 'Email successfully verified.',
        user: result.data.user,
      };
    }

    throw new BadRequestException(
      'Either a verification token or an email + OTP code must be provided.',
    );
  }

  /**
   * Initiate Google OAuth sign-in flow via Neon Auth.
   * Returns the OAuth authorization redirect URL.
   */
  async initiateGoogleAuth(
    dto: GoogleAuthDto,
    origin?: string,
  ): Promise<{ url: string; redirect: boolean }> {
    const callbackURL =
      dto.callbackURL || `${origin || this.defaultOrigin}/auth/callback/google`;

    const result = await this.requestNeonAuth<{ url: string; redirect: boolean }>(
      '/sign-in/social',
      {
        body: {
          provider: 'google',
          callbackURL,
        },
        origin,
      },
    );

    return result.data;
  }
}
