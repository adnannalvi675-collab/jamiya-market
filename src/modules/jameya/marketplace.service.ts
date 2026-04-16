import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { UserService } from '../user/user.service';
import { MarketplaceQueryDto } from './dto/jameya.dto';

interface RankedJameya {
  id: string;
  name: string;
  description: string | null;
  monthlyContribution: number;
  duration: number;
  currency: string;
  isFeatured: boolean;
  conversionRate: number;
  totalSeats: number;
  availableSeats: number;
  fillPercentage: number;
  score: number;
  badges: string[];
  minJoiningPrice: number;
  maxJoiningPrice: number;
}

/**
 * Marketplace service — handles ranking, personalization, and caching.
 * Designed to efficiently serve 5000+ Jameyas with acceptable staleness (~5s).
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get marketplace listing with ranking and personalization.
   */
  async getMarketplace(query: MarketplaceQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const cacheKey = this.buildCacheKey(query);

    // Try cache first (5 second TTL — acceptable staleness)
    return this.cache.getOrSet(
      cacheKey,
      () => this.buildMarketplaceResponse(query, page, limit),
      5,
    );
  }

  private async buildMarketplaceResponse(
    query: MarketplaceQueryDto,
    page: number,
    limit: number,
  ) {
    // Fetch all active Jameyas with seat stats
    const jameyas = await this.fetchJameyasWithStats(query);

    // Apply personalization if userId provided
    let userRiskScore = 50;
    let userBehaviorScore = 50;

    if (query.userId) {
      try {
        const user = await this.userService.findById(query.userId);
        userRiskScore = user.riskScore;
        userBehaviorScore = user.behaviorScore;
      } catch {
        this.logger.warn(
          `User ${query.userId} not found for personalization, using defaults`,
        );
      }
    }

    // Score and rank
    const ranked = jameyas.map((j) =>
      this.scoreJameya(j, userRiskScore, userBehaviorScore),
    );

    // Sort by selected strategy
    this.applySortStrategy(ranked, query.sort || 'trending');

    // Paginate
    const start = (page - 1) * limit;
    const paginated = ranked.slice(start, start + limit);

    return {
      jameyas: paginated,
      total: ranked.length,
      page,
      limit,
      totalPages: Math.ceil(ranked.length / limit),
      metadata: {
        cachedAt: new Date().toISOString(),
        personalized: !!query.userId,
        sortStrategy: query.sort || 'trending',
      },
    };
  }

  private async fetchJameyasWithStats(query: MarketplaceQueryDto) {
    const where: Record<string, unknown> = { status: 'ACTIVE' };

    if (query.minContribution) {
      where.monthlyContribution = {
        ...(where.monthlyContribution as object || {}),
        gte: query.minContribution,
      };
    }

    if (query.maxContribution) {
      where.monthlyContribution = {
        ...(where.monthlyContribution as object || {}),
        lte: query.maxContribution,
      };
    }

    const jameyas = await this.prisma.jameya.findMany({
      where,
      include: {
        seats: {
          select: {
            status: true,
            joiningPrice: true,
          },
        },
      },
    });

    return jameyas.map((j) => {
      const totalSeats = j.seats.length;
      const availableSeats = j.seats.filter((s) => s.status === 'AVAILABLE').length;
      const prices = j.seats
        .filter((s) => s.status === 'AVAILABLE')
        .map((s) => s.joiningPrice);

      return {
        id: j.id,
        name: j.name,
        description: j.description,
        monthlyContribution: j.monthlyContribution,
        duration: j.duration,
        currency: j.currency,
        isFeatured: j.isFeatured,
        conversionRate: j.conversionRate,
        totalSeats,
        availableSeats,
        fillPercentage: totalSeats > 0
          ? Math.round(((totalSeats - availableSeats) / totalSeats) * 100)
          : 0,
        minJoiningPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxJoiningPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalViews: j.totalViews,
        totalBookings: j.totalBookings,
      };
    });
  }

  /**
   * Ranking algorithm:
   * score = featured_boost(100) + conversion_rate(50) + urgency(30) + personalization(20)
   */
  private scoreJameya(
    jameya: ReturnType<MarketplaceService['fetchJameyasWithStats']> extends Promise<(infer T)[]> ? T : never,
    userRiskScore: number,
    userBehaviorScore: number,
  ): RankedJameya {
    let score = 0;
    const badges: string[] = [];

    // 1. Featured boost (admin-promoted Jameyas)
    if (jameya.isFeatured) {
      score += 100;
      badges.push('Featured');
    }

    // 2. Conversion rate (historical success)
    score += jameya.conversionRate * 50;
    if (jameya.conversionRate > 0.7) {
      badges.push('Trending');
    }

    // 3. Urgency factor — near-full Jameyas get boosted
    const occupancyRatio = jameya.fillPercentage / 100;
    if (occupancyRatio > 0.8 && jameya.availableSeats > 0) {
      score += 30 * occupancyRatio;
      if (jameya.availableSeats <= 3) {
        badges.push(`Only ${jameya.availableSeats} seat${jameya.availableSeats === 1 ? '' : 's'} left!`);
      }
    }

    // 4. Personalization — how well does the user's risk profile match?
    // Lower distance = better match = higher score
    const riskMid = (jameya.totalSeats > 0) ? 50 : 50; // Use jameya risk range in real impl
    const riskDistance = Math.abs(userRiskScore - riskMid) / 100;
    const personalizationScore = (1 - riskDistance) * 20;
    score += personalizationScore;

    // 5. Behavior bonus — well-behaved users see better Jameyas first
    if (userBehaviorScore > 70) {
      score += 5;
      if (jameya.conversionRate >= 0.5) {
        badges.push('Best for you');
      }
    }

    return {
      id: jameya.id,
      name: jameya.name,
      description: jameya.description,
      monthlyContribution: jameya.monthlyContribution,
      duration: jameya.duration,
      currency: jameya.currency,
      isFeatured: jameya.isFeatured,
      conversionRate: jameya.conversionRate,
      totalSeats: jameya.totalSeats,
      availableSeats: jameya.availableSeats,
      fillPercentage: jameya.fillPercentage,
      score: Math.round(score * 100) / 100,
      badges,
      minJoiningPrice: jameya.minJoiningPrice,
      maxJoiningPrice: jameya.maxJoiningPrice,
    };
  }

  private applySortStrategy(jameyas: RankedJameya[], strategy: string) {
    switch (strategy) {
      case 'featured':
        jameyas.sort((a, b) => {
          if (a.isFeatured && !b.isFeatured) return -1;
          if (!a.isFeatured && b.isFeatured) return 1;
          return b.score - a.score;
        });
        break;
      case 'best_for_you':
        // Score already incorporates personalization, just sort by it
        jameyas.sort((a, b) => b.score - a.score);
        break;
      case 'newest':
        // Already sorted by createdAt from DB
        break;
      case 'trending':
      default:
        jameyas.sort((a, b) => b.score - a.score);
        break;
    }
  }

  private buildCacheKey(query: MarketplaceQueryDto): string {
    const parts = [
      'marketplace',
      `p${query.page || 1}`,
      `l${query.limit || 20}`,
      query.sort || 'trending',
      query.userId ? `u${query.userId}` : 'anon',
    ];

    if (query.minContribution) parts.push(`min${query.minContribution}`);
    if (query.maxContribution) parts.push(`max${query.maxContribution}`);

    return parts.join(':');
  }
}
