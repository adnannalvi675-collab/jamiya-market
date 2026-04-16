import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ description: 'User ID making the reservation' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Seat ID to reserve' })
  @IsUUID()
  seatId: string;

  @ApiProperty({
    description: 'Client-generated idempotency key to prevent duplicate reservations',
    example: 'res_abc123_seat456',
  })
  @IsString()
  idempotencyKey: string;
}
