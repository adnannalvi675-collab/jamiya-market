import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, throwError, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RedisCacheService } from '../redis/redis-cache.service';

/**
 * Idempotency interceptor.
 * Ensures that duplicate requests with the same idempotency key
 * return the cached response instead of re-processing.
 *
 * Usage: Apply @UseInterceptors(IdempotencyInterceptor) on controller methods
 * Client must send 'x-idempotency-key' header.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly CACHE_TTL = 180; // 3 minutes
  private readonly LOCK_PREFIX = 'idempotency';
  private readonly PROCESSING_STATUS = '__PROCESSING__';

  constructor(private readonly cacheService: RedisCacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    
    // Check header first (Stripe standard), fallback to JSON body if provided there
    const idempotencyKey = (request.headers['x-idempotency-key'] as string) || request.body?.idempotencyKey;

    // Enforce idempotency key strictly to prevent accidental duplicate bookings
    if (!idempotencyKey) {
      throw new BadRequestException('Missing required idempotency key (must be provided in x-idempotency-key header or JSON body)');
    }

    const cacheKey = `${this.LOCK_PREFIX}:${idempotencyKey}`;

    // Check if this request was already processed
    const cached = await this.cacheService.get<{
      status: string;
      data?: unknown;
    }>(cacheKey);

    if (cached) {
      if (cached.status === this.PROCESSING_STATUS) {
        throw new ConflictException(
          'Request is currently being processed. Please wait.',
        );
      }

      this.logger.log(`Returning cached response for key: ${idempotencyKey}`);
      return of(cached.data);
    }

    // Mark as processing
    await this.cacheService.set(
      cacheKey,
      { status: this.PROCESSING_STATUS },
      60, // 60 second processing timeout
    );

    return next.handle().pipe(
      tap(async (data) => {
        // Cache successful response
        await this.cacheService.set(
          cacheKey,
          { status: 'completed', data },
          this.CACHE_TTL,
        );
      }),
      catchError((error) => {
        // Remove processing flag on error so request can be retried (fire-and-forget)
        this.cacheService.del(cacheKey).catch(e => this.logger.error('Failed to cleanup idempotency lock', e));
        return throwError(() => error);
      }),
    );
  }
}
