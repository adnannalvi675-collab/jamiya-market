import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// =============================================================================
// USER RESPONSES
// =============================================================================

export class UserResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'alice@example.com' })
  email: string;

  @ApiProperty({ example: 'Alice Johnson' })
  name: string;

  @ApiPropertyOptional({ example: '+1234567001' })
  phone?: string;

  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'], example: 'VERIFIED' })
  kycStatus: string;

  @ApiProperty({ example: 15.0, description: '0-100 scale, lower = less risky' })
  riskScore: number;

  @ApiProperty({ example: 85.0, description: '0-100 scale, higher = better' })
  behaviorScore: number;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  createdAt: Date;
}

export class KycEligibilityResponse {
  @ApiProperty({ example: true })
  eligible: boolean;

  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'], example: 'VERIFIED' })
  status: string;

  @ApiPropertyOptional({ example: 'KYC verification is pending.' })
  reason?: string;
}

export class RiskProfileResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  userId: string;

  @ApiProperty({ example: 15.0 })
  riskScore: number;

  @ApiProperty({ example: 85.0 })
  behaviorScore: number;

  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] })
  kycStatus: string;

  @ApiProperty({ enum: ['LOW_RISK', 'MODERATE', 'ELEVATED', 'HIGH_RISK'], example: 'LOW_RISK' })
  tier: string;
}

// =============================================================================
// JAMEYA / MARKETPLACE RESPONSES
// =============================================================================

export class SeatSummary {
  @ApiProperty({ example: 'seat-uuid-123' })
  id: string;

  @ApiProperty({ example: 1 })
  seatNumber: number;

  @ApiProperty({ example: 6000.0 })
  joiningPrice: number;

  @ApiProperty({ enum: ['AVAILABLE', 'RESERVED', 'CONFIRMED'], example: 'AVAILABLE' })
  status: string;
}

export class JameyaStatsResponse {
  @ApiProperty({ example: 12 })
  totalSeats: number;

  @ApiProperty({ example: 4 })
  availableSeats: number;

  @ApiProperty({ example: 2 })
  reservedSeats: number;

  @ApiProperty({ example: 6 })
  confirmedSeats: number;

  @ApiProperty({ example: 67, description: 'Percentage of seats taken' })
  fillPercentage: number;
}

export class JameyaDetailResponse {
  @ApiProperty({ example: 'jameya-uuid-456' })
  id: string;

  @ApiProperty({ example: 'Gold Savings Circle' })
  name: string;

  @ApiPropertyOptional({ example: 'Premium savings group for verified members' })
  description?: string;

  @ApiProperty({ example: 500.0 })
  monthlyContribution: number;

  @ApiProperty({ example: 12 })
  duration: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ enum: ['DRAFT', 'ACTIVE', 'FULL', 'COMPLETED', 'CANCELLED'] })
  status: string;

  @ApiProperty({ type: [SeatSummary] })
  seats: SeatSummary[];

  @ApiProperty({ type: JameyaStatsResponse })
  stats: JameyaStatsResponse;
}

export class MarketplaceJameyaResponse {
  @ApiProperty({ example: 'jameya-uuid-456' })
  id: string;

  @ApiProperty({ example: 'Gold Savings Circle' })
  name: string;

  @ApiProperty({ example: 500.0 })
  monthlyContribution: number;

  @ApiProperty({ example: 12 })
  duration: number;

  @ApiProperty({ example: 12 })
  totalSeats: number;

  @ApiProperty({ example: 4 })
  availableSeats: number;

  @ApiProperty({ example: 67 })
  fillPercentage: number;

  @ApiProperty({ example: 142.5, description: 'Ranking score' })
  score: number;

  @ApiProperty({ example: ['Featured', 'Only 4 seats left!'], type: [String] })
  badges: string[];

  @ApiProperty({ example: 4200.0 })
  minJoiningPrice: number;

  @ApiProperty({ example: 6000.0 })
  maxJoiningPrice: number;
}

export class MarketplaceResponse {
  @ApiProperty({ type: [MarketplaceJameyaResponse] })
  jameyas: MarketplaceJameyaResponse[];

  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 8 })
  totalPages: number;
}

// =============================================================================
// RESERVATION RESPONSES
// =============================================================================

export class ReservationPaymentInfo {
  @ApiProperty({ example: 'payment-uuid-789' })
  id: string;

  @ApiProperty({ example: 6000.0 })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 'pi_simulated_abc123_secret_xyz789', description: 'Stripe client secret for frontend' })
  stripeClientSecret: string;

  @ApiProperty({ example: 'pi_simulated_abc123' })
  stripePaymentIntentId: string;
}

export class ReservationCreatedResponse {
  @ApiProperty({
    description: 'Reservation details',
    example: {
      id: 'reservation-uuid-123',
      seatId: 'seat-uuid-456',
      status: 'PENDING',
      expiresAt: '2026-01-15T10:33:00.000Z',
      ttlSeconds: 180,
    },
  })
  reservation: {
    id: string;
    seatId: string;
    status: string;
    expiresAt: string;
    ttlSeconds: number;
  };

  @ApiProperty({ type: ReservationPaymentInfo })
  payment: ReservationPaymentInfo;
}

export class ReservationStatusResponse {
  @ApiProperty({ example: 'reservation-uuid-123' })
  id: string;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] })
  status: string;

  @ApiProperty({ example: '2026-01-15T10:33:00.000Z' })
  expiresAt: string;

  @ApiProperty({ example: false })
  isExpired: boolean;

  @ApiProperty({ example: 145, description: 'Seconds remaining before expiry' })
  remainingSeconds: number;
}

// =============================================================================
// PAYMENT RESPONSES
// =============================================================================

export class WebhookResponse {
  @ApiProperty({ enum: ['success', 'failed', 'already_processed', 'unhandled'] })
  status: string;

  @ApiPropertyOptional({ example: 'payment-uuid-789' })
  paymentId?: string;

  @ApiPropertyOptional({ example: 'reservation-uuid-123' })
  reservationId?: string;

  @ApiPropertyOptional({
    description: 'Reservation confirmation result',
    example: { status: 'confirmed', reservationId: 'reservation-uuid-123' },
  })
  reservation?: {
    status: string;
    reservationId: string;
  };
}

// =============================================================================
// COMMON
// =============================================================================

export class PaginatedResponse {
  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class ErrorResponse {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({ example: 'ConflictException' })
  error: string;

  @ApiProperty({ example: 'Seat is not available. Current status: RESERVED' })
  message: string;

  @ApiProperty({ example: '2026-01-15T10:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/reservations' })
  path: string;
}

export class ReconciliationResponse {
  @ApiProperty({ example: 2 })
  issuesFound: number;

  @ApiProperty({ example: ['Released orphaned seat: seat-uuid-123'], type: [String] })
  issues: string[];
}
