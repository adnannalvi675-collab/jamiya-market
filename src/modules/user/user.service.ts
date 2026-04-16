import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { UpdateKycDto } from './dto/user.dto';
import { KycStatus } from '@prisma/client';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}



  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findAll(page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
    
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take: limitNum, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count(),
    ]);

    return { users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async updateKycStatus(userId: string, dto: UpdateKycDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: dto.kycStatus as KycStatus },
    });

    // Invalidate cached KYC status
    await this.cache.del(`user:kyc:${userId}`);
    this.logger.log(`KYC status updated for user ${userId}: ${dto.kycStatus}`);
    return user;
  }

  /**
   * Check user KYC eligibility for seat reservation.
   * Uses cached KYC status with fallback to DB.
   */
  async checkKycEligibility(userId: string): Promise<{
    eligible: boolean;
    status: KycStatus;
    reason?: string;
  }> {
    const cachedStatus = await this.cache.get<KycStatus>(`user:kyc:${userId}`);
    let kycStatus: KycStatus;

    if (cachedStatus) {
      kycStatus = cachedStatus;
    } else {
      const user = await this.findById(userId);
      kycStatus = user.kycStatus;
      // Cache for 30 seconds — slight staleness acceptable
      await this.cache.set(`user:kyc:${userId}`, kycStatus, 30);
    }

    if (kycStatus === 'VERIFIED') {
      return { eligible: true, status: kycStatus };
    }

    if (kycStatus === 'PENDING') {
      return {
        eligible: false,
        status: kycStatus,
        reason: 'KYC verification is pending. Please complete verification first.',
      };
    }

    return {
      eligible: false,
      status: kycStatus,
      reason: `KYC status is ${kycStatus}. Unable to reserve seat.`,
    };
  }


}
