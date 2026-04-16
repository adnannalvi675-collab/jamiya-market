import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Redis cache service for marketplace data.
 * Provides get/set with TTL, invalidation, and JSON serialization.
 */
@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Get a cached value, deserializing from JSON.
   */
  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch {
      this.logger.warn(`Failed to parse cache value for key: ${key}`);
      return null;
    }
  }

  /**
   * Set a cached value with TTL (in seconds).
   */
  async set(key: string, value: unknown, ttlSeconds: number = 5): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
    } catch (e) {
      this.logger.warn(`Failed to stringify cache value for key: ${key}`, e);
    }
  }

  /**
   * Delete a cached key.
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Delete all keys matching a pattern.
   * Use sparingly — SCAN-based for production safety.
   */
  async delPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  /**
   * Get or set pattern — fetch from cache, or execute callback and cache result.
   */
  async getOrSet<T>(
    key: string,
    callback: () => Promise<T>,
    ttlSeconds: number = 5,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await callback();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
