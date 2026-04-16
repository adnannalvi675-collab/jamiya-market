import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ReservationService } from './reservation.service';
import { CreateReservationDto } from './dto/reservation.dto';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import {
  ReservationCreatedResponse,
  ReservationStatusResponse,
  ReconciliationResponse,
  ErrorResponse,
} from '../../common/dto/responses.dto';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: '🔒 Reserve a seat (Phase 1 — Temporary Lock)',
    description: `**This is the critical Phase 1 of the 2-phase reservation flow.**

### What happens:
1. Validates user KYC eligibility (cached, 30s TTL)
2. Acquires Redis distributed lock on the seat
3. Uses \`SELECT FOR UPDATE\` for row-level DB lock
4. Creates a PENDING reservation with TTL (default: 3 minutes)
5. Creates a Stripe PaymentIntent (**user is NOT charged**)
6. Updates seat status to RESERVED

### Returns:
- Reservation details with expiry countdown
- Stripe \`clientSecret\` for frontend payment UI

### Idempotency:
Include \`x-idempotency-key\` header. Duplicate requests return the cached reservation.

### After this call:
The user has 3 minutes to complete payment via Stripe. If payment is not completed,
the background worker will release the seat automatically.`,
  })
  @ApiHeader({
    name: 'x-idempotency-key',
    required: false,
    description: 'Idempotency key to prevent duplicate reservations',
    example: 'res_user123_seat456_1705312200',
  })
  @ApiResponse({
    status: 201,
    description: 'Seat reserved successfully. Use clientSecret to complete payment.',
    type: ReservationCreatedResponse,
  })
  @ApiResponse({
    status: 403,
    description: 'KYC not verified — user cannot reserve',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 409,
    description: 'Seat is already reserved or confirmed',
    type: ErrorResponse,
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to acquire lock (high contention)',
    type: ErrorResponse,
  })
  reserveSeat(@Body() dto: CreateReservationDto) {
    return this.reservationService.reserveSeat(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get reservation status',
    description: 'Returns reservation details including real-time expiry countdown. Use this to poll reservation status.',
  })
  @ApiParam({ name: 'id', description: 'Reservation UUID' })
  @ApiResponse({ status: 200, description: 'Reservation details', type: ReservationStatusResponse })
  @ApiResponse({ status: 404, description: 'Reservation not found', type: ErrorResponse })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.reservationService.findById(id);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get all reservations for a user',
    description: 'Returns all reservations (PENDING, CONFIRMED, EXPIRED, CANCELLED) for a user, ordered by most recent.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User reservations', type: [ReservationStatusResponse] })
  findByUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.reservationService.findByUser(userId);
  }


}
