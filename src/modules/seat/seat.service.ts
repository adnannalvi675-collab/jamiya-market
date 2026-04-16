import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SeatStatus } from '@prisma/client';

@Injectable()
export class SeatService {
  private readonly logger = new Logger(SeatService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const seat = await this.prisma.seat.findUnique({
      where: { id },
      include: { jameya: true },
    });
    if (!seat) throw new NotFoundException(`Seat ${id} not found`);
    return seat;
  }

  async findByJameya(jameyaId: string) {
    return this.prisma.seat.findMany({
      where: { jameyaId },
      orderBy: { seatNumber: 'asc' },
    });
  }

  async getAvailableSeats(jameyaId: string) {
    return this.prisma.seat.findMany({
      where: {
        jameyaId,
        status: SeatStatus.AVAILABLE,
      },
      orderBy: { seatNumber: 'asc' },
    });
  }

  /**
   * Atomically reserve a seat using SELECT FOR UPDATE.
   * This is called WITHIN a Redis lock for double-layer protection.
   * Returns the locked seat row within a transaction.
   */
  async lockSeatForReservation(
    seatId: string,
    tx: any, // Prisma transaction client
  ): Promise<{ id: string; status: SeatStatus; version: number; joiningPrice: number; jameyaId: string }> {
    // SELECT FOR UPDATE — row-level lock within the transaction
    const seats = await tx.$queryRaw`
      SELECT id, status, version, "joiningPrice", "jameyaId"
      FROM seats
      WHERE id = ${seatId}
      FOR UPDATE
    `;

    const seatRows = seats as Array<{
      id: string;
      status: SeatStatus;
      version: number;
      joiningPrice: number;
      jameyaId: string;
    }>;

    if (!seatRows || seatRows.length === 0) {
      throw new NotFoundException(`Seat ${seatId} not found`);
    }

    const seat = seatRows[0];

    if (seat.status !== SeatStatus.AVAILABLE) {
      throw new ConflictException(
        `Seat ${seatId} is not available. Current status: ${seat.status}`,
      );
    }

    return seat;
  }

  /**
   * Update seat status within a transaction.
   * Uses optimistic locking via version field.
   */
  async updateSeatStatus(
    seatId: string,
    newStatus: SeatStatus,
    expectedVersion: number,
    tx: any,
  ) {
    const result = await tx.seat.updateMany({
      where: {
        id: seatId,
        version: expectedVersion,
      },
      data: {
        status: newStatus,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException(
        `Seat ${seatId} was modified by another transaction (version conflict)`,
      );
    }

    this.logger.log(`Seat ${seatId} status updated to ${newStatus}`);
    return result;
  }

  /**
   * Release a seat back to AVAILABLE (used by expiry worker).
   */
  async releaseSeat(seatId: string) {
    await this.prisma.seat.update({
      where: { id: seatId },
      data: {
        status: SeatStatus.AVAILABLE,
        version: { increment: 1 },
      },
    });
    this.logger.log(`Seat ${seatId} released back to AVAILABLE`);
  }
}
