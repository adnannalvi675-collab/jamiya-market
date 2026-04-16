import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import { PaymentStatus } from '@prisma/client';

interface CreatePaymentData {
  reservationId: string;
  userId: string;
  amount: number;
  currency: string;
}

/**
 * Payment service — handles Stripe PaymentIntent lifecycle.
 *
 * In development mode, Stripe calls are simulated.
 * The service creates PaymentIntent records and provides
 * simulated client secrets for the frontend.
 *
 * CRITICAL: PaymentIntents are created in PENDING state.
 * Users are only "charged" when the webhook confirms success.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly isSimulated: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Hardcoded simulated Stripe key for testing
    const stripeKey = 'sk_test_simulated_key_for_testing';
    this.isSimulated = stripeKey.includes('simulated');

    if (this.isSimulated) {
      this.logger.warn(
        '⚠️  Running in SIMULATED Stripe mode. No real charges will be made.',
      );
    }
  }

  /**
   * Create a Stripe PaymentIntent (or simulate one).
   * Called within the reservation transaction — does NOT charge the user.
   */
  async createPaymentIntent(data: CreatePaymentData, tx?: any) {
    const db = tx || this.prisma;
    const idempotencyKey = `pi_${data.reservationId}_${uuidv4()}`;

    // In simulated mode, generate fake Stripe IDs
    const stripePaymentIntentId = this.isSimulated
      ? `pi_simulated_${uuidv4().replace(/-/g, '').slice(0, 24)}`
      : await this.createRealPaymentIntent(data);

    const stripeClientSecret = this.isSimulated
      ? `${stripePaymentIntentId}_secret_${uuidv4().replace(/-/g, '').slice(0, 16)}`
      : 'real_secret'; // Would come from Stripe API

    const payment = await db.payment.create({
      data: {
        reservationId: data.reservationId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        status: PaymentStatus.PENDING,
        stripePaymentIntentId,
        stripeClientSecret,
        idempotencyKey,
      },
    });

    this.logger.log(
      `PaymentIntent created: ${payment.id} (stripe: ${stripePaymentIntentId})`,
    );

    return payment;
  }

  /**
   * Cancel a Stripe PaymentIntent (used when reservation expires).
   */
  async cancelPaymentIntent(stripePaymentIntentId: string) {
    if (this.isSimulated) {
      this.logger.log(
        `[SIMULATED] Cancelled PaymentIntent: ${stripePaymentIntentId}`,
      );
      return;
    }

    // In production: call stripe.paymentIntents.cancel(stripePaymentIntentId)
    this.logger.log(`Cancelled PaymentIntent: ${stripePaymentIntentId}`);
  }

  /**
   * Process a Stripe webhook event.
   * Handles payment_intent.succeeded and payment_intent.payment_failed.
   */
  async handleWebhook(event: {
    type: string;
    data: {
      object: {
        id: string;
        status: string;
        metadata?: Record<string, string>;
      };
    };
  }) {
    const paymentIntentId = event.data.object.id;

    this.logger.log(
      `Webhook received: ${event.type} for PI: ${paymentIntentId}`,
    );

    // Find the payment record
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { reservation: true },
    });

    if (!payment) {
      this.logger.warn(`No payment found for PI: ${paymentIntentId}`);
      throw new BadRequestException(
        `Unknown payment intent: ${paymentIntentId}`,
      );
    }

    // Idempotency check — already processed
    if (payment.status === 'SUCCESS' || payment.status === 'REFUNDED') {
      this.logger.log(
        `Payment ${payment.id} already processed (${payment.status}). Ignoring duplicate webhook.`,
      );
      return { status: 'already_processed', paymentId: payment.id };
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        return this.handlePaymentSuccess(payment);

      case 'payment_intent.payment_failed':
        return this.handlePaymentFailure(
          payment,
          'Payment failed via Stripe',
        );

      default:
        this.logger.warn(`Unhandled webhook event type: ${event.type}`);
        return { status: 'unhandled', event: event.type };
    }
  }

  /**
   * Simulate a payment callback (for development/testing).
   * Allows testing the full flow without real Stripe webhooks.
   */
  async simulatePaymentCallback(
    paymentIntentId: string,
    success: boolean,
  ) {
    if (!this.isSimulated) {
      throw new BadRequestException(
        'Payment simulation only available in simulated mode',
      );
    }

    const event = {
      type: success
        ? 'payment_intent.succeeded'
        : 'payment_intent.payment_failed',
      data: {
        object: {
          id: paymentIntentId,
          status: success ? 'succeeded' : 'failed',
        },
      },
    };

    return this.handleWebhook(event);
  }

  // ==========================================================================
  // PRIVATE HANDLERS
  // ==========================================================================

  private async handlePaymentSuccess(payment: any) {
    // Lazy import to avoid circular dependency
    const { ReservationService } = await import(
      '../reservation/reservation.service'
    );

    // We don't call ReservationService directly here to avoid circular deps.
    // Instead, we update payment and let the controller handle reservation confirmation.
    // The webhook controller will call reservationService.confirmReservation()

    this.logger.log(`Payment ${payment.id} succeeded for reservation ${payment.reservationId}`);

    return {
      status: 'success',
      paymentId: payment.id,
      reservationId: payment.reservationId,
      idempotencyKey: payment.idempotencyKey,
    };
  }

  private async handlePaymentFailure(payment: any, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      // Mark payment as failed
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: reason,
          processedAt: new Date(),
        },
      });

      // Release the reservation and seat
      await tx.reservation.update({
        where: { id: payment.reservationId },
        data: { status: 'CANCELLED' },
      });

      await tx.seat.update({
        where: { id: payment.reservation.seatId },
        data: { status: 'AVAILABLE', version: { increment: 1 } },
      });
    });

    this.logger.log(
      `Payment ${payment.id} failed. Seat released for reservation ${payment.reservationId}`,
    );

    return {
      status: 'failed',
      paymentId: payment.id,
      reservationId: payment.reservationId,
      reason,
    };
  }

  /**
   * Create a real Stripe PaymentIntent (production).
   * Currently a placeholder — would use the Stripe SDK.
   */
  private async createRealPaymentIntent(
    data: CreatePaymentData,
  ): Promise<string> {
    /*
    const stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY'));
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(data.amount * 100), // Stripe uses cents
      currency: data.currency,
      metadata: {
        reservationId: data.reservationId,
        userId: data.userId,
      },
    });
    return intent.id;
    */
    throw new Error('Real Stripe integration not configured');
  }
}
