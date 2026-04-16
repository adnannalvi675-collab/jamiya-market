import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { ReservationService } from '../reservation/reservation.service';
import { WebhookResponse, ErrorResponse } from '../../common/dto/responses.dto';
import { ValidateNested, IsObject, IsString, IsBoolean, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';



class SimulatePaymentDto {
  @ApiProperty({
    example: 'pi_simulated_abc123def456',
    description: 'PaymentIntent ID returned from the reservation step',
  })
  @IsString()
  @IsNotEmpty()
  paymentIntentId: string;

  @ApiProperty({
    example: true,
    description: 'true = payment succeeded, false = payment failed',
  })
  @IsBoolean()
  success: boolean;
}

interface WebhookResult {
  status: string;
  paymentId?: string;
  reservationId?: string;
  idempotencyKey?: string;
  reason?: string;
  event?: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly reservationService: ReservationService,
  ) {}



  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '🧪 Simulate a payment callback (dev only)',
    description: `**Development-only endpoint** that simulates a Stripe webhook.

Use this to test the full reservation flow without real Stripe integration.

### Steps:
1. Call \`POST /api/reservations\` to reserve a seat → get \`stripePaymentIntentId\`
2. Call this endpoint with the PaymentIntent ID
3. Set \`success: true\` to simulate successful payment
4. Set \`success: false\` to simulate failed payment

Only available when Stripe key contains "simulated".`,
  })
  @ApiResponse({
    status: 200,
    description: 'Simulated payment processed',
    type: WebhookResponse,
  })
  @ApiResponse({
    status: 400,
    description: 'Simulation not available in production mode',
    type: ErrorResponse,
  })
  async simulatePayment(@Body() dto: SimulatePaymentDto) {
    this.logger.log(
      `Simulating payment: PI=${dto.paymentIntentId}, success=${dto.success}`,
    );

    const result: WebhookResult = await this.paymentService.simulatePaymentCallback(
      dto.paymentIntentId,
      dto.success,
    );

    if (result.status === 'success' && result.reservationId && result.idempotencyKey) {
      const confirmation = await this.reservationService.confirmReservation(
        result.reservationId,
        dto.paymentIntentId,
        result.idempotencyKey,
      );
      return { ...result, reservation: confirmation };
    }

    return result;
  }
}
