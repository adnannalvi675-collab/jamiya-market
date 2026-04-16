import { IsEmail, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export class UpdateKycDto {
  @ApiProperty({ enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'] })
  @IsEnum(['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'])
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
}
