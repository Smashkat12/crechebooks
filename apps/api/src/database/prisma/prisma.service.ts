import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Prisma 7 requires an adapter for direct database connections
    // Pool size can be configured via DATABASE_POOL_SIZE environment variable
    const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: poolSize,
    });
    const adapter = new PrismaPg(pool);

    super({ adapter });

    this.pool = pool;
  }

  /**
   * Get the underlying pg.Pool instance for monitoring
   * TASK-PERF-104: Database Connection Pool Monitoring
   */
  getPool(): Pool {
    return this.pool;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error(
        'Failed to connect to database',
        error instanceof Error ? error.stack : error,
      );
      throw error; // FAIL FAST - do not swallow errors
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
