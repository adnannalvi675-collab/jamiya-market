import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceService } from './marketplace.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { UserService } from '../user/user.service';
import { 
  createMockPrisma, 
  mockRedisCacheService, 
  mockUserService 
} from '../../common/test/test-utils';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisCacheService, useValue: mockRedisCacheService },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  describe('getMarketplace', () => {
    it('should rank featured Jameyas higher', async () => {
      // Mock 3 Jameyas: one featured, one with high conversion, one normal
      const mockJameyas = [
        {
          id: 'j-1',
          name: 'Featured Jameya',
          isFeatured: true,
          conversionRate: 0.5,
          fillPercentage: 10,
          seats: [],
          totalViews: 100,
          totalBookings: 5,
          monthlyContribution: 500,
          duration: 12,
        },
        {
          id: 'j-2',
          name: 'High Conversion Jameya',
          isFeatured: false,
          conversionRate: 0.9,
          fillPercentage: 10,
          seats: [],
          totalViews: 100,
          totalBookings: 90,
          monthlyContribution: 500,
          duration: 12,
        },
        {
          id: 'j-3',
          name: 'Normal Jameya',
          isFeatured: false,
          conversionRate: 0.2,
          fillPercentage: 10,
          seats: [],
          totalViews: 10,
          totalBookings: 2,
          monthlyContribution: 500,
          duration: 12,
        }
      ];

      mockRedisCacheService.getOrSet.mockImplementation(async (key, factory) => await factory());
      prisma.jameya.findMany.mockResolvedValue(mockJameyas);

      const result = await service.getMarketplace({});

      // The featured one (j-1) should be at index 0 because featured boost is 100
      expect(result.jameyas[0].id).toBe('j-1');
      // The high conversion one (j-2) should be second
      expect(result.jameyas[1].id).toBe('j-2');
      // All items should have scores
      expect(result.jameyas[0].score).toBeGreaterThan(result.jameyas[1].score);
    });

    it('should apply personalization boost if userId is provided', async () => {
       const mockJameyas = [{
          id: 'j-1',
          name: 'Standard Jameya',
          isFeatured: false,
          conversionRate: 0.5,
          fillPercentage: 50,
          seats: [],
          totalViews: 10,
          totalBookings: 5,
          monthlyContribution: 500,
          duration: 12,
        }];

        mockRedisCacheService.getOrSet.mockImplementation(async (key, factory) => await factory());
        prisma.jameya.findMany.mockResolvedValue(mockJameyas);
        
        // Mock user with high behavior score
        mockUserService.findById.mockResolvedValue({
          id: 'u-1',
          riskScore: 30,
          behaviorScore: 90,
        });

        const result = await service.getMarketplace({ userId: 'u-1' });
        
        // Check if "Best for you" badge is applied due to high behavior score
        expect(result.jameyas[0].badges).toContain('Best for you');
    });
  });
});
