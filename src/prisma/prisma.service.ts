import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }

  /**
   * Execute a callback within a Prisma interactive transaction.
   * Provides ACID guarantees for multi-step operations.
   */
  async executeInTransaction<T>(
    callback: (tx: PrismaClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.$transaction(
      (tx) => callback(tx as unknown as PrismaClient),
      {
        maxWait: options?.maxWait ?? 5000,
        timeout: options?.timeout ?? 10000,
        isolationLevel: 'Serializable',
      },
    );
  }
}
