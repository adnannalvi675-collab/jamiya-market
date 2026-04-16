import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RESERVATION_QUEUE } from './reservation-expiry.processor';

/**
 * Scheduler that enqueues reservation expiry jobs at regular intervals.
 * Uses NestJS Schedule module with a cron expression.
 */
@Injectable()
export class ReservationScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReservationScheduler.name);

  constructor(
    @InjectQueue(RESERVATION_QUEUE) private readonly expiryQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Reservation scheduler initialized');
    // Run once on startup to clean any stale reservations
    await this.enqueueExpiryJob();
  }

  /**
   * Run every 30 seconds to clean up expired reservations.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleExpiryCron() {
    await this.enqueueExpiryJob();
  }

  private async enqueueExpiryJob() {
    try {
      await this.expiryQueue.add(
        'expire-reservations',
        { timestamp: Date.now() },
        {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    } catch (error) {
      this.logger.error(`Failed to enqueue expiry job: ${error}`);
    }
  }
}
