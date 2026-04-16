import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JameyaService } from './jameya.service';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceQueryDto } from './dto/jameya.dto';
import {
  JameyaDetailResponse,
  MarketplaceResponse,
  ErrorResponse,
} from '../../common/dto/responses.dto';

@ApiTags('jameyas')
@Controller('jameyas')
export class JameyaController {
  constructor(
    private readonly jameyaService: JameyaService,
    private readonly marketplaceService: MarketplaceService,
  ) {}



  @Get('marketplace')
  @ApiTags('marketplace')
  @ApiOperation({
    summary: 'Get ranked marketplace listing',
    description: `Returns Jameyas ranked by a scoring algorithm that considers:
      - **Featured boost** (admin-promoted)
      - **Conversion rate** (historical booking success)
      - **Urgency factor** (near-full Jameyas ranked higher)
      - **Personalization** (match to user risk/behavior profile)
      
      Results are cached in Redis with a 5-second TTL.
      Pass \`userId\` to enable personalized ranking.`,
  })
  @ApiResponse({ status: 200, description: 'Ranked marketplace listing', type: MarketplaceResponse })
  getMarketplace(@Query() query: MarketplaceQueryDto): Promise<any> {
    return this.marketplaceService.getMarketplace(query);
  }

  @Get()
  @ApiOperation({ summary: 'List all active Jameyas (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated Jameya list' })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.jameyaService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Jameya by ID with seat details and stats',
    description: 'Returns full Jameya details including all seats and availability statistics. Also increments view count for ranking.',
  })
  @ApiParam({ name: 'id', description: 'Jameya UUID' })
  @ApiResponse({ status: 200, description: 'Jameya with seats and stats', type: JameyaDetailResponse })
  @ApiResponse({ status: 404, description: 'Jameya not found', type: ErrorResponse })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.jameyaService.findById(id);
  }
}
