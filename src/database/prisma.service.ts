import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './schema/contract.d.js';
import contractJson from './schema/contract.json' with { type: 'json' };

export type DatabaseClient = ReturnType<typeof postgres<Contract>>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly client: DatabaseClient;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('database.url');

    if (!databaseUrl) {
      throw new Error(
        'Database connection URL is missing. Ensure DATABASE_URL is configured in your environment or .env file.',
      );
    }

    this.client = postgres<Contract>({
      contractJson,
      url: databaseUrl,
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      const branch = this.configService.get<string>('database.branch', 'production');
      this.logger.log(
        `Successfully connected to Neon PostgreSQL database (branch: ${branch}).`,
      );
    } catch (error) {
      this.logger.error('Failed to connect to Neon PostgreSQL database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.close();
      this.logger.log('Disconnected from Neon PostgreSQL database.');
    } catch (error) {
      this.logger.warn('Error while closing database connection:', error);
    }
  }
}
