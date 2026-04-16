import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { v4 as uuidv4 } from 'uuid';

/**
 * Distributed lock service using Redis.
 * Implements the single-instance Redis lock pattern with:
 * - Atomic SET NX EX (acquire)
 * - Lua script for safe release (only release if we own the lock)
 * - Auto-expiry to prevent deadlocks
 */
@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  // Lua script for atomic lock release — only releases if the lock value matches
  private readonly RELEASE_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Acquire a distributed lock.
   * @param key Lock key (e.g., "seat-lock:seat-uuid")
   * @param ttlMs Lock TTL in milliseconds (auto-release safety net)
   * @param retryAttempts Number of retry attempts
   * @param retryDelayMs Delay between retries in milliseconds
   * @returns Lock token if acquired, null otherwise
   */
  async acquire(
    key: string,
    ttlMs: number = 10000,
    retryAttempts: number = 3,
    retryDelayMs: number = 200,
  ): Promise<string | null> {
    const lockToken = uuidv4();
    const lockKey = `lock:${key}`;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      const result = await this.redis.set(
        lockKey,
        lockToken,
        'PX',
        ttlMs,
        'NX',
      );

      if (result === 'OK') {
        this.logger.debug(`Lock acquired: ${lockKey} (token: ${lockToken})`);
        return lockToken;
      }

      if (attempt < retryAttempts) {
        this.logger.debug(
          `Lock busy: ${lockKey}, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${retryAttempts})`,
        );
        await this.delay(retryDelayMs);
      }
    }

    this.logger.warn(`Failed to acquire lock: ${lockKey} after ${retryAttempts} retries`);
    return null;
  }

  /**
   * Release a distributed lock.
   * Uses a Lua script to atomically check ownership and delete.
   * @param key Lock key
   * @param token Lock token from acquire()
   * @returns true if released, false if lock was already expired or owned by another
   */
  async release(key: string, token: string): Promise<boolean> {
    const lockKey = `lock:${key}`;

    const result = await this.redis.eval(
      this.RELEASE_SCRIPT,
      1,
      lockKey,
      token,
    );

    const released = result === 1;

    if (released) {
      this.logger.debug(`Lock released: ${lockKey}`);
    } else {
      this.logger.warn(`Lock release failed (expired or wrong owner): ${lockKey}`);
    }

    return released;
  }

  /**
   * Execute a callback while holding a distributed lock.
   * Automatically acquires and releases the lock.
   */
  async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    ttlMs: number = 10000,
    retryAttempts: number = 3,
  ): Promise<T> {
    const token = await this.acquire(key, ttlMs, retryAttempts);

    if (!token) {
      throw new Error(
        `Failed to acquire lock for key: ${key}. Resource is currently locked.`,
      );
    }

    try {
      return await callback();
    } finally {
      await this.release(key, token);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
