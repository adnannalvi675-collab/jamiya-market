import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SeatService } from './seat.service';
import { SeatSummary, ErrorResponse } from '../../common/dto/responses.dto';

@ApiTags('seats')
@Controller('seats')
export class SeatController {
  constructor(private readonly seatService: SeatService) {}

  @Get('jameya/:jameyaId')
  @ApiOperation({
    summary: 'Get all seats for a Jameya',
    description: 'Returns all seats regardless of status, ordered by seat number.',
  })
  @ApiParam({ name: 'jameyaId', description: 'Jameya UUID' })
  @ApiResponse({ status: 200, description: 'List of seats', type: [SeatSummary] })
  findByJameya(@Param('jameyaId', ParseUUIDPipe) jameyaId: string) {
    return this.seatService.findByJameya(jameyaId);
  }

  @Get('jameya/:jameyaId/available')
  @ApiOperation({
    summary: 'Get available seats for a Jameya',
    description: 'Returns only seats with status AVAILABLE. Use this to show bookable seats. Note: slight staleness (~5s) is acceptable.',
  })
  @ApiParam({ name: 'jameyaId', description: 'Jameya UUID' })
  @ApiResponse({ status: 200, description: 'Available seats', type: [SeatSummary] })
  getAvailable(@Param('jameyaId', ParseUUIDPipe) jameyaId: string) {
    return this.seatService.getAvailableSeats(jameyaId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get seat by ID with Jameya details' })
  @ApiParam({ name: 'id', description: 'Seat UUID' })
  @ApiResponse({ status: 200, description: 'Seat details' })
  @ApiResponse({ status: 404, description: 'Seat not found', type: ErrorResponse })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.seatService.findById(id);
  }
}
