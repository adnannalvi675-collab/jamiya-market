import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReservationService } from './reservation.service';

export const RESERVATION_QUEUE = 'reservation-expiry';

/**
 * BullMQ worker that processes expired reservation cleanup jobs.
 * Runs on a recurring schedule to find and release expired PENDING reservations.
 */
@Processor(RESERVATION_QUEUE)
export class ReservationExpiryProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationExpiryProcessor.name);

  constructor(private readonly reservationService: ReservationService) {
    super();
  }

  async process(job: Job): Promise<{ expiredCount: number }> {
    this.logger.log(`Processing reservation expiry job: ${job.id}`);

    try {
      const expiredCount =
        await this.reservationService.expireStaleReservations();

      this.logger.log(
        `Expiry job complete. Expired ${expiredCount} reservations.`,
      );

      return { expiredCount };
    } catch (error) {
      this.logger.error(`Expiry job failed: ${error}`);
      throw error;
    }
  }
}
