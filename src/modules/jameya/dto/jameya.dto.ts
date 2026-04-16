import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';



export class MarketplaceQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'User ID for personalization' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: ['featured', 'trending', 'best_for_you', 'newest'] })
  @IsOptional()
  @IsEnum(['featured', 'trending', 'best_for_you', 'newest'])
  sort?: string;

  @ApiPropertyOptional({ example: 100, description: 'Min monthly contribution' })
  @IsOptional()
  @IsNumber()
  minContribution?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Max monthly contribution' })
  @IsOptional()
  @IsNumber()
  maxContribution?: number;
}
