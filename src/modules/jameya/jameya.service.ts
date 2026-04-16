import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';

import { SeatStatus } from '@prisma/client';

@Injectable()
export class JameyaService {
  private readonly logger = new Logger(JameyaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}



  async findById(id: string) {
    const jameya = await this.prisma.jameya.findUnique({
      where: { id },
      include: {
        seats: {
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!jameya) throw new NotFoundException(`Jameya ${id} not found`);

    // Compute availability stats
    const totalSeats = jameya.seats.length;
    const availableSeats = jameya.seats.filter(
      (s) => s.status === 'AVAILABLE',
    ).length;
    const reservedSeats = jameya.seats.filter(
      (s) => s.status === 'RESERVED',
    ).length;
    const confirmedSeats = jameya.seats.filter(
      (s) => s.status === 'CONFIRMED',
    ).length;

    return {
      ...jameya,
      stats: {
        totalSeats,
        availableSeats,
        reservedSeats,
        confirmedSeats,
        fillPercentage: Math.round(((totalSeats - availableSeats) / totalSeats) * 100),
      },
    };
  }

  async findAll(page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [jameyas, total] = await Promise.all([
      this.prisma.jameya.findMany({
        skip,
        take: limitNum,
        where: { status: 'ACTIVE' },
        include: {
          seats: {
            select: { id: true, status: true, seatNumber: true, joiningPrice: true },
            orderBy: { seatNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.jameya.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      jameyas,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

}
