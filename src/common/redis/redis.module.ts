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
        // Using public Railway Redis URL
        const redisUrl = 'redis://default:vRusskOLSRJLfEijjgfziCVOXSqJQUgD@nozomi.proxy.rlwy.net:51015';
        return new Redis(redisUrl);
      },
      inject: [ConfigService],
    },
    RedisLockService,
    RedisCacheService,
  ],
  exports: [REDIS_CLIENT, RedisLockService, RedisCacheService],
})
export class RedisModule {}
