import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisLockService } from './redis-lock.service';
import { RedisCacheService } from './redis-cache.service';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const redisUrl = configService.get('REDIS_URL');
        
        let redis: Redis;
        if (redisUrl) {
          logger.log('Connecting to Redis using URL');
          redis = new Redis(redisUrl);
        } else {
          logger.log('Connecting to Redis using individual config');
          redis = new Redis({
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD'),
            username: configService.get('REDIS_USER', 'default'),
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times) => {
              const delay = Math.min(times * 50, 2000);
              logger.warn(`Redis retry attempt ${times}, waiting ${delay}ms`);
              return delay;
            },
          });
        }

        redis.on('error', (err) => {
          logger.error(`Redis connection error: ${err.message}`);
        });

        redis.on('connect', () => {
          logger.log('✅ Connected to Redis');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    RedisLockService,
    RedisCacheService,
  ],
  exports: [REDIS_CLIENT, RedisLockService, RedisCacheService],
})
export class RedisModule {}
