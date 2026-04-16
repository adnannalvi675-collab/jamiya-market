import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReservationService } from './reservation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { SeatService } from '../seat/seat.service';
import { UserService } from '../user/user.service';
import { PaymentService } from '../payment/payment.service';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { SeatStatus, ReservationStatus } from '@prisma/client';
import { 
  createMockPrisma, 
  mockRedisLockService, 
  mockRedisCacheService, 
  mockConfigService,
  mockPaymentService,
  mockUserService,
  mockSeatService 
} from '../../common/test/test-utils';

describe('ReservationService', () => {
  let service: ReservationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisLockService, useValue: mockRedisLockService },
        { provide: RedisCacheService, useValue: mockRedisCacheService },
        { provide: SeatService, useValue: mockSeatService },
        { provide: UserService, useValue: mockUserService },
        { provide: PaymentService, useValue: mockPaymentService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ReservationService>(ReservationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reserveSeat', () => {
    const dto = {
      userId: 'user-1',
      seatId: 'seat-1',
      idempotencyKey: 'key-1',
    };

    it('should successfully reserve a seat', async () => {
      // Setup mocks
      prisma.reservation.findUnique.mockResolvedValue(null);
      mockUserService.checkKycEligibility.mockResolvedValue({ eligible: true });
      mockSeatService.lockSeatForReservation.mockResolvedValue({
        id: 'seat-1',
        status: SeatStatus.AVAILABLE,
        version: 1,
        joiningPrice: 500,
      });
      
      prisma.$transaction.mockImplementation(async (arg: any) => {
        if (typeof arg === 'function') {
          return await arg(prisma);
        }
        return null;
      });
      
      prisma.reservation.create.mockResolvedValue({
        id: 'res-1',
        status: ReservationStatus.PENDING,
        expiresAt: new Date(),
      });
      
      mockPaymentService.createPaymentIntent.mockResolvedValue({
        id: 'pay-1',
        amount: 500,
        currency: 'USD',
        stripeClientSecret: 'secret_123',
        stripePaymentIntentId: 'pi_123',
      });

      const result = await service.reserveSeat(dto);

      expect(result.reservation.id).toBe('res-1');
      expect(mockSeatService.updateSeatStatus).toHaveBeenCalledWith(
        dto.seatId,
        SeatStatus.RESERVED,
        1,
        prisma // We expect the transaction client to be our mocked prisma
      );
    });

    it('should throw ForbiddenException if KYC not eligible', async () => {
      prisma.reservation.findUnique.mockResolvedValue(null);
      mockUserService.checkKycEligibility.mockResolvedValue({ 
        eligible: false, 
        reason: 'KYC failed' 
      });

      await expect(service.reserveSeat(dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirmReservation', () => {
    it('should recover if reservation expired but seat is available', async () => {
      const reservationId = 'res-1';
      const paymentIntentId = 'pi_123';
      const idempotencyKey = 'ident-1';

      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) => await cb(prisma));
      
      // Mock raw query for reservation lock - simulating EXPIRED
      prisma.$queryRaw.mockResolvedValueOnce([
        { 
          id: reservationId, 
          status: ReservationStatus.EXPIRED, 
          expiresAt: new Date(Date.now() - 10000), // 10s ago
          seatId: 'seat-1',
          userId: 'user-1'
        }
      ]);

      // Mock raw query for seat lock - simulating AVAILABLE
      prisma.$queryRaw.mockResolvedValueOnce([
        { id: 'seat-1', status: SeatStatus.AVAILABLE }
      ]);

      const result = await service.confirmReservation(reservationId, paymentIntentId, idempotencyKey);

      expect(result.status).toBe('recovered_and_confirmed');
      expect(prisma.seat.update).toHaveBeenCalled();
      expect(prisma.reservation.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ReservationStatus.CONFIRMED })
      }));
    });

    it('should throw ConflictException if reservation expired and seat is taken', async () => {
      const reservationId = 'res-1';
      
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: any) => await cb(prisma));
      
      prisma.$queryRaw.mockResolvedValueOnce([
        { id: reservationId, status: ReservationStatus.EXPIRED, expiresAt: new Date(), seatId: 'seat-1' }
      ]);
      
      // Seat taken
      prisma.$queryRaw.mockResolvedValueOnce([
        { id: 'seat-1', status: SeatStatus.RESERVED }
      ]);

      await expect(service.confirmReservation(reservationId, 'pi_1', 'k1')).rejects.toThrow(ConflictException);
    });
  });
});
