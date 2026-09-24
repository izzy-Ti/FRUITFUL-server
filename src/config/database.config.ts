import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  unpooledUrl: string;
  branch: string;
}

export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => {
    const url = process.env.DATABASE_URL;
    const unpooledUrl = process.env.DATABASE_URL_UNPOOLED || url;
    const branch = process.env.NEON_BRANCH || 'production';

    if (!url) {
      throw new Error(
        'DATABASE_URL is not defined in the environment variables. Please check your .env file.',
      );
    }

    return {
      url,
      unpooledUrl: unpooledUrl || '',
      branch,
    };
  },
);
