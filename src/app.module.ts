import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { UserModule } from './modules/user/user.module';
import { JameyaModule } from './modules/jameya/jameya.module';
import { SeatModule } from './modules/seat/seat.module';
import { ReservationModule } from './modules/reservation/reservation.module';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // BullMQ for background jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get('REDIS_URL');
        if (redisUrl) {
          console.log(`[BullModule] Using REDIS_URL for connection`);
          return { connection: redisUrl };
        }
        console.log(`[BullModule] Using individual Redis config (fallback)`);
        return {
          connection: {
            host: configService.get('REDIS_HOST', 'localhost'),
            port: configService.get('REDIS_PORT', 6379),
            password: configService.get('REDIS_PASSWORD'),
            username: configService.get('REDIS_USER', 'default'),
          },
        };
      },
      inject: [ConfigService],
    }),

    // Scheduled tasks
    ScheduleModule.forRoot(),

    // Core modules
    PrismaModule,
    RedisModule,

    // Domain modules
    UserModule,
    JameyaModule,
    SeatModule,
    ReservationModule,
    PaymentModule,
  ],
})
export class AppModule {}
