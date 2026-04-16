import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { SeatService } from '../seat/seat.service';
import { UserService } from '../user/user.service';
import { PaymentService } from '../payment/payment.service';
import { CreateReservationDto } from './dto/reservation.dto';
import { SeatStatus, ReservationStatus } from '@prisma/client';

/**
 * ============================================================================
 * RESERVATION SERVICE — 2-PHASE SEAT RESERVATION SYSTEM
 * ============================================================================
 *
 * CRITICAL BUSINESS RULE: Users must NEVER be charged unless a seat is
 * successfully reserved.
 *
 * Flow:
 * 1. PHASE 1 — Reserve (Temporary Lock):
 *    a. Validate user KYC eligibility
 *    b. Acquire Redis distributed lock on the seat
 *    c. Within DB transaction: SELECT FOR UPDATE on seat row
 *    d. Create PENDING reservation with TTL
 *    e. Create Stripe PaymentIntent (NOT charged yet)
 *    f. Update seat status to RESERVED
 *    g. Release Redis lock
 *    h. Return reservation + Stripe clientSecret
 *
 * 2. PHASE 2 — Confirm (After Payment):
 *    a. Stripe webhook fires with payment success
 *    b. Verify reservation is still valid (not expired)
 *    c. Within DB transaction: confirm reservation + seat
 *    d. Idempotency key prevents duplicate confirmations
 *
 * 3. EXPIRY — Background Worker:
 *    a. BullMQ cron job finds expired PENDING reservations
 *    b. Releases seats back to AVAILABLE
 *    c. Cancels associated Stripe PaymentIntents
 * ============================================================================
 */
@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);
  private readonly reservationTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: RedisLockService,
    private readonly cacheService: RedisCacheService,
    private readonly seatService: SeatService,
    private readonly userService: UserService,
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {
    this.reservationTtlSeconds = this.configService.get(
      'RESERVATION_TTL_SECONDS',
      180, // 3 minutes default
    );
  }

  // ==========================================================================
  // PHASE 1: RESERVE SEAT (Temporary Lock)
  // ==========================================================================

  async reserveSeat(dto: CreateReservationDto) {
    this.logger.log(
      `Reservation request: user=${dto.userId}, seat=${dto.seatId}, key=${dto.idempotencyKey}`,
    );

    // 1. Check for existing reservation with the same idempotency key
    const existingReservation = await this.prisma.reservation.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { payments: true },
    });

    if (existingReservation) {
      this.logger.log(
        `Duplicate reservation request detected: ${dto.idempotencyKey}`,
      );
      return this.formatReservationResponse(existingReservation);
    }

    // 2. Validate user KYC eligibility
    const kycCheck = await this.userService.checkKycEligibility(dto.userId);
    if (!kycCheck.eligible) {
      throw new ForbiddenException(kycCheck.reason);
    }

    // 3. Acquire Redis distributed lock on the seat
    const lockKey = `seat:${dto.seatId}`;

    return this.lockService.withLock(
      lockKey,
      async () => {
        // 4. DB transaction: lock seat row + create reservation + create payment intent
        return this.prisma.$transaction(async (tx) => {
          // 4a. SELECT FOR UPDATE — row-level lock
          const seat = await this.seatService.lockSeatForReservation(
            dto.seatId,
            tx,
          );

          // 4b. Create reservation with TTL
          const expiresAt = new Date(
            Date.now() + this.reservationTtlSeconds * 1000,
          );

          const reservation = await tx.reservation.create({
            data: {
              userId: dto.userId,
              seatId: dto.seatId,
              status: ReservationStatus.PENDING,
              expiresAt,
              idempotencyKey: dto.idempotencyKey,
            },
          });

          // 4c. Update seat status to RESERVED
          await this.seatService.updateSeatStatus(
            dto.seatId,
            SeatStatus.RESERVED,
            seat.version,
            tx,
          );

          // 4d. Create Stripe PaymentIntent (user is NOT charged yet)
          const payment = await this.paymentService.createPaymentIntent(
            {
              reservationId: reservation.id,
              userId: dto.userId,
              amount: seat.joiningPrice,
              currency: 'USD',
            },
            tx,
          );

          this.logger.log(
            `Reservation created: ${reservation.id}, expires at ${expiresAt.toISOString()}`,
          );

          // Invalidate marketplace cache since a seat was reserved
          await this.cacheService.delPattern('marketplace:*');

          return {
            reservation: {
              id: reservation.id,
              seatId: dto.seatId,
              status: reservation.status,
              expiresAt: reservation.expiresAt,
              ttlSeconds: this.reservationTtlSeconds,
            },
            payment: {
              id: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              stripeClientSecret: payment.stripeClientSecret,
              stripePaymentIntentId: payment.stripePaymentIntentId,
            },
          };
        }, {
          maxWait: 5000,
          timeout: 10000,
        });
      },
      15000, // Redis lock TTL: 15 seconds
      5,     // Retry attempts
    );
  }

  // ==========================================================================
  // PHASE 2: CONFIRM RESERVATION (After Payment)
  // ==========================================================================

  async confirmReservation(
    reservationId: string,
    paymentIntentId: string,
    idempotencyKey: string,
  ) {
    this.logger.log(
      `Confirming reservation: ${reservationId}, paymentIntent: ${paymentIntentId}`,
    );

    // Check for duplicate confirmation via payment idempotency key
    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment && existingPayment.status === 'SUCCESS') {
      this.logger.log(
        `Duplicate confirmation detected for payment: ${idempotencyKey}`,
      );
      return { status: 'already_confirmed', reservationId };
    }

    // DB transaction: confirm everything atomically
    return this.prisma.$transaction(async (tx) => {
      // Lock the reservation row
      const reservations = await tx.$queryRaw`
        SELECT id, status, "expiresAt", "seatId", "userId"
        FROM reservations
        WHERE id = ${reservationId}
        FOR UPDATE
      `;

      const reservationRows = reservations as Array<{
        id: string;
        status: ReservationStatus;
        expiresAt: Date;
        seatId: string;
        userId: string;
      }>;

      if (!reservationRows || reservationRows.length === 0) {
        throw new NotFoundException(`Reservation ${reservationId} not found`);
      }

      const reservation = reservationRows[0];

      // Handle edge cases
      if (reservation.status === 'CONFIRMED') {
        return { status: 'already_confirmed', reservationId };
      }

      if (reservation.status === 'CANCELLED') {
        throw new ConflictException(
          'Reservation was cancelled. A refund will be issued.',
        );
      }

      // CRITICAL EDGE CASE: Payment success but reservation expired
      if (reservation.status === 'EXPIRED' || new Date() > new Date(reservation.expiresAt)) {
        this.logger.warn(
          `Payment success but reservation expired: ${reservationId}. Triggering recovery.`,
        );

        // Attempt recovery: check if the seat is still available
        const seatCheck = await tx.$queryRaw`
          SELECT id, status FROM seats WHERE id = ${reservation.seatId} FOR UPDATE
        `;

        const seatRows = seatCheck as Array<{ id: string; status: SeatStatus }>;

        if (seatRows.length > 0 && seatRows[0].status === 'AVAILABLE') {
          // Recovery: re-reserve the seat for the user
          this.logger.log(
            `Recovery: re-assigning seat ${reservation.seatId} to user ${reservation.userId}`,
          );

          await tx.seat.update({
            where: { id: reservation.seatId },
            data: { status: SeatStatus.CONFIRMED, version: { increment: 1 } },
          });

          await tx.reservation.update({
            where: { id: reservationId },
            data: {
              status: ReservationStatus.CONFIRMED,
              confirmedAt: new Date(),
            },
          });

          await tx.payment.updateMany({
            where: { reservationId, idempotencyKey },
            data: { status: 'SUCCESS', processedAt: new Date() },
          });

          return { status: 'recovered_and_confirmed', reservationId };
        }

        // Seat taken by someone else — need refund
        await tx.payment.updateMany({
          where: { reservationId, idempotencyKey },
          data: {
            status: 'REFUNDED',
            processedAt: new Date(),
            failureReason: 'Reservation expired, seat no longer available',
          },
        });

        throw new ConflictException(
          'Reservation expired and seat is no longer available. A refund will be issued.',
        );
      }

      // Happy path: confirm everything
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      });

      await tx.seat.update({
        where: { id: reservation.seatId },
        data: { status: SeatStatus.CONFIRMED, version: { increment: 1 } },
      });

      await tx.payment.updateMany({
        where: { reservationId, idempotencyKey },
        data: { status: 'SUCCESS', processedAt: new Date() },
      });

      // Update Jameya booking stats
      const seat = await tx.seat.findUnique({
        where: { id: reservation.seatId },
        select: { jameyaId: true },
      });

      if (seat) {
        await tx.jameya.update({
          where: { id: seat.jameyaId },
          data: { totalBookings: { increment: 1 } },
        });
      }

      this.logger.log(`Reservation ${reservationId} CONFIRMED successfully`);

      // Invalidate marketplace cache
      await this.cacheService.delPattern('marketplace:*');

      return { status: 'confirmed', reservationId };
    }, {
      maxWait: 5000,
      timeout: 15000,
    });
  }

  // ==========================================================================
  // EXPIRY: Find and release expired reservations
  // ==========================================================================

  async expireStaleReservations(): Promise<number> {
    const now = new Date();

    // Find all expired PENDING reservations
    const expiredReservations = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.PENDING,
        expiresAt: { lt: now },
      },
      include: {
        payments: true,
      },
    });

    if (expiredReservations.length === 0) {
      return 0;
    }

    this.logger.log(
      `Found ${expiredReservations.length} expired reservations to clean up`,
    );

    let expiredCount = 0;

    for (const reservation of expiredReservations) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Update reservation status
          await tx.reservation.update({
            where: { id: reservation.id },
            data: { status: ReservationStatus.EXPIRED },
          });

          // Release the seat
          await tx.seat.update({
            where: { id: reservation.seatId },
            data: {
              status: SeatStatus.AVAILABLE,
              version: { increment: 1 },
            },
          });

          // Mark any pending payments as failed
          await tx.payment.updateMany({
            where: {
              reservationId: reservation.id,
              status: 'PENDING',
            },
            data: {
              status: 'FAILED',
              failureReason: 'Reservation expired',
              processedAt: new Date(),
            },
          });
        });

        // Cancel Stripe PaymentIntent if exists
        for (const payment of reservation.payments) {
          if (payment.stripePaymentIntentId && payment.status === 'PENDING') {
            try {
              await this.paymentService.cancelPaymentIntent(
                payment.stripePaymentIntentId,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to cancel Stripe PI ${payment.stripePaymentIntentId}: ${err}`,
              );
            }
          }
        }

        expiredCount++;
        this.logger.log(
          `Expired reservation ${reservation.id}, released seat ${reservation.seatId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to expire reservation ${reservation.id}: ${err}`,
        );
      }
    }

    // Invalidate marketplace cache after releasing seats
    if (expiredCount > 0) {
      await this.cacheService.delPattern('marketplace:*');
    }

    return expiredCount;
  }



  // ==========================================================================
  // QUERIES
  // ==========================================================================

  async findById(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        seat: { include: { jameya: true } },
        payments: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    return this.formatReservationResponse(reservation);
  }

  async findByUser(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: {
        seat: { include: { jameya: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private formatReservationResponse(reservation: any) {
    const now = new Date();
    const expiresAt = new Date(reservation.expiresAt);
    const isExpired =
      reservation.status === 'PENDING' && now > expiresAt;
    const remainingSeconds = isExpired
      ? 0
      : Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

    return {
      ...reservation,
      isExpired,
      remainingSeconds,
    };
  }
}
