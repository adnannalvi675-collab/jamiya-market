import { Global, Module } from '@nestjs/common';
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
        return new Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          maxRetriesPerRequest: null, // Required for BullMQ compatibility
          enableReadyCheck: false,
        });
      },
      inject: [ConfigService],
    },
    RedisLockService,
    RedisCacheService,
  ],
  exports: [REDIS_CLIENT, RedisLockService, RedisCacheService],
})
export class RedisModule {}
