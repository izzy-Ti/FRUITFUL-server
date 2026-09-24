import { registerAs } from '@nestjs/config';

export interface AppConfig {
  env: string;
  port: number;
  appName: string;
  isProduction: boolean;
}

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    appName: process.env.APP_NAME || 'Fruitful Journey API',
    isProduction: process.env.NODE_ENV === 'production',
  }),
);
