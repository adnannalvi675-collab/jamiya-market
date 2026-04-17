/**
 * Generates swagger.json without starting the full server.
 * This avoids needing PostgreSQL/Redis running.
 *
 * Usage: npx ts-node src/scripts/generate-swagger.ts
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

// Import controllers directly (skip DB-dependent providers)
import { UserController } from '../modules/user/user.controller';
import { JameyaController } from '../modules/jameya/jameya.controller';
import { SeatController } from '../modules/seat/seat.controller';
import { ReservationController } from '../modules/reservation/reservation.controller';
import { PaymentController } from '../modules/payment/payment.controller';

// Create a minimal module that only registers controllers for Swagger scanning
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    UserController,
    JameyaController,
    SeatController,
    ReservationController,
    PaymentController,
  ],
  providers: [
    // Mock all services so NestJS can instantiate controllers
    { provide: 'UserService', useValue: {} },
    { provide: 'JameyaService', useValue: {} },
    { provide: 'MarketplaceService', useValue: {} },
    { provide: 'SeatService', useValue: {} },
    { provide: 'ReservationService', useValue: {} },
    { provide: 'PaymentService', useValue: {} },
    { provide: 'RedisCacheService', useValue: {} },
  ],
})
class SwaggerGenModule {}

async function generateSwagger() {
  // Instead of using the NestJS DI system (which needs DB connections),
  // we build the OpenAPI spec manually with all the proper types.
  
  const spec = buildOpenApiSpec();
  
  const outputPath = path.join(process.cwd(), 'swagger.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
  console.log(`✅ swagger.json generated at: ${outputPath}`);
  console.log(`📄 ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  console.log(`\n🌐 View at: https://editor.swagger.io (paste the JSON)`);
}

function buildOpenApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Jameya Marketplace API',
      description: `## 🏦 Collaborative Savings Groups Marketplace

A production-ready REST API for managing **Jameyas** (collaborative savings groups),
seat reservations, and payments.

### Key Features
- **2-Phase Seat Reservation** — Reserve with TTL, confirm after payment
- **Concurrency Safe** — Redis distributed locks + PostgreSQL row locks
- **Idempotent** — Duplicate requests safely return cached responses
- **Marketplace Ranking** — Featured, trending, personalized recommendations
- **Payment Integration** — Stripe (simulated in dev mode)

### Critical Business Rule
> Users are **NEVER** charged unless a seat is successfully reserved.

### Reservation Flow
1. \`POST /api/reservations\` → Creates temporary hold (TTL = 3 min)
2. User pays via Stripe (client-side)
3. \`POST /api/payments/webhook\` → Confirms seat after payment success
4. Background worker releases expired reservations every 30s`,
      version: '1.0.0',
      contact: {
        name: 'Jameya Marketplace Team',
        url: 'https://github.com/jameya-marketplace',
        email: 'team@jameya.io',
      },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local Development' },
      { url: 'https://jamiya-market-production.up.railway.app', description: 'Production (placeholder)' },
    ],
    tags: [
      { name: 'marketplace', description: 'Browse and discover Jameyas with personalized ranking' },
      { name: 'jameyas', description: 'Create and manage Jameya savings groups' },
      { name: 'seats', description: 'View and manage seats within Jameyas' },
      { name: 'reservations', description: 'Reserve seats with 2-phase confirmation flow' },
      { name: 'payments', description: 'Process payments and handle Stripe webhooks' },
      { name: 'users', description: 'User management, KYC verification, and risk profiling' },
    ],
    paths: {
      // =====================================================================
      // USERS
      // =====================================================================
      '/api/users': {
        post: {
          tags: ['users'],
          summary: 'Create a new user',
          operationId: 'createUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateUserDto' },
                example: {
                  email: 'john@example.com',
                  name: 'John Doe',
                  phone: '+1234567890',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User created successfully',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
            },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '409': { description: 'Email already exists' },
          },
        },
        get: {
          tags: ['users'],
          summary: 'List all users (paginated)',
          operationId: 'listUsers',
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1, minimum: 1 }, example: 1 },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }, example: 20 },
          ],
          responses: {
            '200': {
              description: 'Paginated list of users',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedUsers' } } },
            },
          },
        },
      },
      '/api/users/{id}': {
        get: {
          tags: ['users'],
          summary: 'Get user by ID',
          operationId: 'getUser',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'User details', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            '404': { description: 'User not found' },
          },
        },
      },
      '/api/users/{id}/kyc': {
        patch: {
          tags: ['users'],
          summary: 'Update user KYC status',
          description: 'Updates KYC verification status. Invalidates cached KYC eligibility.',
          operationId: 'updateKyc',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateKycDto' },
                example: { kycStatus: 'VERIFIED' },
              },
            },
          },
          responses: {
            '200': { description: 'KYC status updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            '404': { description: 'User not found' },
          },
        },
      },
      '/api/users/{id}/risk-profile': {
        get: {
          tags: ['users'],
          summary: 'Get user risk profile',
          description: 'Returns risk score, behavior score, KYC status, and risk tier classification.',
          operationId: 'getRiskProfile',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Risk profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/RiskProfile' } } } },
            '404': { description: 'User not found' },
          },
        },
      },
      '/api/users/{id}/kyc-eligibility': {
        get: {
          tags: ['users'],
          summary: 'Check KYC eligibility for seat reservation',
          description: 'Checks if the user can reserve a seat. Uses cached KYC status (30s TTL).',
          operationId: 'checkKycEligibility',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'KYC eligibility result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/KycEligibility' },
                  example: { eligible: true, status: 'VERIFIED' },
                },
              },
            },
          },
        },
      },

      // =====================================================================
      // JAMEYAS
      // =====================================================================
      '/api/jameyas': {
        post: {
          tags: ['jameyas'],
          summary: 'Create a new Jameya with auto-generated seats',
          description: 'Creates a Jameya and auto-generates seats. Number of seats = duration (months). Earlier seats have higher joining prices.',
          operationId: 'createJameya',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateJameyaDto' },
                example: {
                  name: 'Gold Savings Circle',
                  description: 'Premium savings group for verified members',
                  monthlyContribution: 500,
                  duration: 12,
                  currency: 'USD',
                  isFeatured: true,
                },
              },
            },
          },
          responses: {
            '201': { description: 'Jameya created with seats', content: { 'application/json': { schema: { $ref: '#/components/schemas/JameyaDetail' } } } },
            '400': { description: 'Validation error' },
          },
        },
        get: {
          tags: ['jameyas'],
          summary: 'List all active Jameyas (paginated)',
          operationId: 'listJameyas',
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, example: 1 },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20 }, example: 20 },
          ],
          responses: {
            '200': { description: 'Paginated Jameya list' },
          },
        },
      },
      '/api/jameyas/marketplace': {
        get: {
          tags: ['marketplace', 'jameyas'],
          summary: '🏪 Get ranked marketplace listing (with personalization)',
          description: `Returns Jameyas ranked by a scoring algorithm:
- **Featured boost** (100 pts) — Admin-promoted
- **Conversion rate** (0-50 pts) — Historical booking success
- **Urgency factor** (0-30 pts) — Near-full Jameyas ranked higher
- **Personalization** (0-20 pts) — Match to user risk/behavior profile

Results cached in Redis (5s TTL). Pass \`userId\` for personalized ranking.

Badges: "Featured", "Trending", "Only N seats left!", "Best for you"`,
          operationId: 'getMarketplace',
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, example: 1 },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20, maximum: 100 }, example: 20 },
            { name: 'userId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'User ID for personalized ranking' },
            { name: 'sort', in: 'query', required: false, schema: { type: 'string', enum: ['featured', 'trending', 'best_for_you', 'newest'] }, example: 'trending' },
            { name: 'minContribution', in: 'query', required: false, schema: { type: 'number' }, description: 'Min monthly contribution filter' },
            { name: 'maxContribution', in: 'query', required: false, schema: { type: 'number' }, description: 'Max monthly contribution filter' },
          ],
          responses: {
            '200': {
              description: 'Ranked marketplace listing',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/MarketplaceResponse' } } },
            },
          },
        },
      },
      '/api/jameyas/{id}': {
        get: {
          tags: ['jameyas'],
          summary: 'Get Jameya by ID with seat details and stats',
          description: 'Returns full Jameya details including all seats and availability statistics. Increments view count.',
          operationId: 'getJameya',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Jameya with seats and stats', content: { 'application/json': { schema: { $ref: '#/components/schemas/JameyaDetail' } } } },
            '404': { description: 'Jameya not found' },
          },
        },
      },

      // =====================================================================
      // SEATS
      // =====================================================================
      '/api/seats/jameya/{jameyaId}': {
        get: {
          tags: ['seats'],
          summary: 'Get all seats for a Jameya',
          operationId: 'getSeatsByJameya',
          parameters: [{ name: 'jameyaId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'List of seats', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Seat' } } } } },
          },
        },
      },
      '/api/seats/jameya/{jameyaId}/available': {
        get: {
          tags: ['seats'],
          summary: 'Get available seats for a Jameya',
          description: 'Returns only AVAILABLE seats. Slight staleness (~5s) is acceptable.',
          operationId: 'getAvailableSeats',
          parameters: [{ name: 'jameyaId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Available seats', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Seat' } } } } },
          },
        },
      },
      '/api/seats/{id}': {
        get: {
          tags: ['seats'],
          summary: 'Get seat by ID with Jameya details',
          operationId: 'getSeat',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Seat details' },
            '404': { description: 'Seat not found' },
          },
        },
      },

      // =====================================================================
      // RESERVATIONS
      // =====================================================================
      '/api/reservations': {
        post: {
          tags: ['reservations'],
          summary: '🔒 Reserve a seat (Phase 1 — Temporary Lock)',
          description: `**Critical Phase 1 of the 2-phase reservation flow.**

1. Validates user KYC eligibility (cached, 30s TTL)
2. Acquires Redis distributed lock on the seat
3. Uses \`SELECT FOR UPDATE\` for row-level DB lock
4. Creates PENDING reservation with TTL (default: 3 minutes)
5. Creates Stripe PaymentIntent (user is NOT charged)
6. Updates seat status to RESERVED

Returns reservation details + Stripe \`clientSecret\` for payment UI.
Include \`x-idempotency-key\` header for safe retries.`,
          operationId: 'reserveSeat',
          parameters: [
            { name: 'x-idempotency-key', in: 'header', required: false, schema: { type: 'string' }, example: 'res_user123_seat456_1705312200', description: 'Idempotency key' },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateReservationDto' },
                example: {
                  userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                  seatId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
                  idempotencyKey: 'res_user123_seat456_1705312200',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Seat reserved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReservationCreated' },
                  example: {
                    reservation: {
                      id: 'reservation-uuid-123',
                      seatId: 'seat-uuid-456',
                      status: 'PENDING',
                      expiresAt: '2026-01-15T10:33:00.000Z',
                      ttlSeconds: 180,
                    },
                    payment: {
                      id: 'payment-uuid-789',
                      amount: 6000,
                      currency: 'USD',
                      stripeClientSecret: 'pi_simulated_abc123_secret_xyz789',
                      stripePaymentIntentId: 'pi_simulated_abc123',
                    },
                  },
                },
              },
            },
            '403': { description: 'KYC not verified', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '409': { description: 'Seat already reserved/confirmed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '500': { description: 'Failed to acquire lock (high contention)' },
          },
        },
      },
      '/api/reservations/{id}': {
        get: {
          tags: ['reservations'],
          summary: 'Get reservation status with live countdown',
          description: 'Returns reservation details including real-time expiry countdown.',
          operationId: 'getReservation',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': {
              description: 'Reservation details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReservationStatus' },
                  example: {
                    id: 'reservation-uuid-123',
                    status: 'PENDING',
                    expiresAt: '2026-01-15T10:33:00.000Z',
                    isExpired: false,
                    remainingSeconds: 145,
                  },
                },
              },
            },
            '404': { description: 'Reservation not found' },
          },
        },
      },
      '/api/reservations/user/{userId}': {
        get: {
          tags: ['reservations'],
          summary: "Get all user's reservations",
          operationId: 'getUserReservations',
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'User reservations' },
          },
        },
      },
      '/api/reservations/reconcile': {
        post: {
          tags: ['reservations'],
          summary: '🔧 Run reconciliation job (admin)',
          description: 'Detects and fixes: orphaned RESERVED seats, successful payments without confirmed reservations.',
          operationId: 'runReconciliation',
          responses: {
            '200': {
              description: 'Reconciliation results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReconciliationResult' },
                  example: { issuesFound: 2, issues: ['Released orphaned seat: seat-uuid-123'] },
                },
              },
            },
          },
        },
      },

      // =====================================================================
      // PAYMENTS
      // =====================================================================
      '/api/payments/webhook': {
        post: {
          tags: ['payments'],
          summary: '🔔 Stripe webhook callback handler (Phase 2)',
          description: `**Phase 2 of the 2-phase reservation flow.**

Handles:
- \`payment_intent.succeeded\` → Confirms reservation
- \`payment_intent.payment_failed\` → Cancels reservation, releases seat

Edge cases: expired reservation recovery, duplicate callbacks.`,
          operationId: 'handleWebhook',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WebhookEvent' },
                example: {
                  type: 'payment_intent.succeeded',
                  data: { object: { id: 'pi_simulated_abc123', status: 'succeeded' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Webhook processed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookResult' },
                  example: {
                    status: 'success',
                    paymentId: 'payment-uuid-789',
                    reservationId: 'reservation-uuid-123',
                    reservation: { status: 'confirmed', reservationId: 'reservation-uuid-123' },
                  },
                },
              },
            },
            '400': { description: 'Unknown payment intent' },
            '409': { description: 'Reservation expired, seat unavailable' },
          },
        },
      },
      '/api/payments/simulate': {
        post: {
          tags: ['payments'],
          summary: '🧪 Simulate payment callback (dev only)',
          description: 'Simulates a Stripe webhook for testing. Only available in simulated Stripe mode.',
          operationId: 'simulatePayment',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SimulatePayment' },
                example: { paymentIntentId: 'pi_simulated_abc123', success: true },
              },
            },
          },
          responses: {
            '200': { description: 'Simulated payment processed', content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookResult' } } } },
            '400': { description: 'Simulation not available in production' },
          },
        },
      },
    },

    // =======================================================================
    // SCHEMAS
    // =======================================================================
    components: {
      schemas: {
        // --- DTOs ---
        CreateUserDto: {
          type: 'object',
          required: ['email', 'name'],
          properties: {
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            name: { type: 'string', example: 'John Doe' },
            phone: { type: 'string', example: '+1234567890' },
          },
        },
        UpdateKycDto: {
          type: 'object',
          required: ['kycStatus'],
          properties: {
            kycStatus: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] },
          },
        },
        CreateJameyaDto: {
          type: 'object',
          required: ['name', 'monthlyContribution', 'duration'],
          properties: {
            name: { type: 'string', example: 'Gold Savings Circle' },
            description: { type: 'string', example: 'Premium savings group' },
            monthlyContribution: { type: 'number', minimum: 1, example: 500 },
            duration: { type: 'integer', minimum: 2, maximum: 60, example: 12, description: 'Months = number of seats' },
            currency: { type: 'string', default: 'USD' },
            isFeatured: { type: 'boolean', default: false },
            minRiskScore: { type: 'number', default: 0 },
            maxRiskScore: { type: 'number', default: 100 },
          },
        },
        CreateReservationDto: {
          type: 'object',
          required: ['userId', 'seatId', 'idempotencyKey'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
            seatId: { type: 'string', format: 'uuid' },
            idempotencyKey: { type: 'string', example: 'res_user123_seat456_1705312200' },
          },
        },
        WebhookEvent: {
          type: 'object',
          required: ['type', 'data'],
          properties: {
            type: { type: 'string', enum: ['payment_intent.succeeded', 'payment_intent.payment_failed'] },
            data: {
              type: 'object',
              properties: {
                object: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', example: 'pi_simulated_abc123' },
                    status: { type: 'string', enum: ['succeeded', 'failed'] },
                  },
                },
              },
            },
          },
        },
        SimulatePayment: {
          type: 'object',
          required: ['paymentIntentId', 'success'],
          properties: {
            paymentIntentId: { type: 'string', example: 'pi_simulated_abc123' },
            success: { type: 'boolean', example: true },
          },
        },

        // --- Response Models ---
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            kycStatus: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] },
            riskScore: { type: 'number', description: '0-100, lower = less risky' },
            behaviorScore: { type: 'number', description: '0-100, higher = better' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PaginatedUsers: {
          type: 'object',
          properties: {
            users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
            total: { type: 'integer', example: 50 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalPages: { type: 'integer', example: 3 },
          },
        },
        RiskProfile: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            riskScore: { type: 'number', example: 15.0 },
            behaviorScore: { type: 'number', example: 85.0 },
            kycStatus: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] },
            tier: { type: 'string', enum: ['LOW_RISK', 'MODERATE', 'ELEVATED', 'HIGH_RISK'] },
          },
        },
        KycEligibility: {
          type: 'object',
          properties: {
            eligible: { type: 'boolean' },
            status: { type: 'string', enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] },
            reason: { type: 'string', nullable: true },
          },
        },
        Seat: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            jameyaId: { type: 'string', format: 'uuid' },
            seatNumber: { type: 'integer', example: 1 },
            joiningPrice: { type: 'number', example: 6000.0 },
            status: { type: 'string', enum: ['AVAILABLE', 'RESERVED', 'CONFIRMED'] },
            version: { type: 'integer', description: 'Optimistic lock version' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        JameyaDetail: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Gold Savings Circle' },
            description: { type: 'string', nullable: true },
            monthlyContribution: { type: 'number', example: 500 },
            duration: { type: 'integer', example: 12 },
            currency: { type: 'string', example: 'USD' },
            status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'FULL', 'COMPLETED', 'CANCELLED'] },
            isFeatured: { type: 'boolean' },
            seats: { type: 'array', items: { $ref: '#/components/schemas/Seat' } },
            stats: {
              type: 'object',
              properties: {
                totalSeats: { type: 'integer', example: 12 },
                availableSeats: { type: 'integer', example: 4 },
                reservedSeats: { type: 'integer', example: 2 },
                confirmedSeats: { type: 'integer', example: 6 },
                fillPercentage: { type: 'integer', example: 67 },
              },
            },
          },
        },
        MarketplaceJameya: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            monthlyContribution: { type: 'number' },
            duration: { type: 'integer' },
            totalSeats: { type: 'integer' },
            availableSeats: { type: 'integer' },
            fillPercentage: { type: 'integer' },
            score: { type: 'number', description: 'Ranking score' },
            badges: { type: 'array', items: { type: 'string' }, example: ['Featured', 'Only 4 seats left!'] },
            minJoiningPrice: { type: 'number' },
            maxJoiningPrice: { type: 'number' },
          },
        },
        MarketplaceResponse: {
          type: 'object',
          properties: {
            jameyas: { type: 'array', items: { $ref: '#/components/schemas/MarketplaceJameya' } },
            total: { type: 'integer', example: 150 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            totalPages: { type: 'integer', example: 8 },
            metadata: {
              type: 'object',
              properties: {
                cachedAt: { type: 'string', format: 'date-time' },
                personalized: { type: 'boolean' },
                sortStrategy: { type: 'string' },
              },
            },
          },
        },
        ReservationCreated: {
          type: 'object',
          properties: {
            reservation: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                seatId: { type: 'string', format: 'uuid' },
                status: { type: 'string', example: 'PENDING' },
                expiresAt: { type: 'string', format: 'date-time' },
                ttlSeconds: { type: 'integer', example: 180 },
              },
            },
            payment: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                amount: { type: 'number', example: 6000 },
                currency: { type: 'string', example: 'USD' },
                stripeClientSecret: { type: 'string', example: 'pi_simulated_abc123_secret_xyz789' },
                stripePaymentIntentId: { type: 'string', example: 'pi_simulated_abc123' },
              },
            },
          },
        },
        ReservationStatus: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            seatId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED'] },
            expiresAt: { type: 'string', format: 'date-time' },
            isExpired: { type: 'boolean' },
            remainingSeconds: { type: 'integer', example: 145 },
            confirmedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ReconciliationResult: {
          type: 'object',
          properties: {
            issuesFound: { type: 'integer', example: 2 },
            issues: { type: 'array', items: { type: 'string' } },
          },
        },
        WebhookResult: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success', 'failed', 'already_processed', 'already_confirmed', 'recovered_and_confirmed', 'unhandled'] },
            paymentId: { type: 'string', format: 'uuid' },
            reservationId: { type: 'string', format: 'uuid' },
            reservation: {
              type: 'object',
              nullable: true,
              properties: {
                status: { type: 'string' },
                reservationId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer', example: 409 },
            error: { type: 'string', example: 'ConflictException' },
            message: { type: 'string', example: 'Seat is not available. Current status: RESERVED' },
            timestamp: { type: 'string', format: 'date-time' },
            path: { type: 'string', example: '/api/reservations' },
          },
        },
      },
    },
  };
}

generateSwagger().catch(console.error);
