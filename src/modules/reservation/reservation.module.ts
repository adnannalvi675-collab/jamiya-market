import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';
import { ReservationExpiryProcessor, RESERVATION_QUEUE } from './reservation-expiry.processor';
import { ReservationScheduler } from './reservation.scheduler';
import { SeatModule } from '../seat/seat.module';
import { UserModule } from '../user/user.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: RESERVATION_QUEUE }),
    SeatModule,
    UserModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [ReservationController],
  providers: [
    ReservationService,
    ReservationExpiryProcessor,
    ReservationScheduler,
  ],
  exports: [ReservationService],
})
export class ReservationModule {}
