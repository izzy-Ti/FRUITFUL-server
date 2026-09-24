import { registerAs } from '@nestjs/config';

export interface AuthConfig {
  baseUrl: string;
  jwksUrl: string;
}

export const authConfig = registerAs(
  'auth',
  (): AuthConfig => ({
    baseUrl: process.env.NEON_AUTH_BASE_URL || '',
    jwksUrl: process.env.NEON_AUTH_JWKS_URL || '',
  }),
);
