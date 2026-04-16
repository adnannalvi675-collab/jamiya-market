import {
  Controller,
  Get,
  Post,
  Patch,
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
import { UserService } from './user.service';
import { UpdateKycDto } from './dto/user.dto';
import {
  UserResponse,
  KycEligibilityResponse,
  ErrorResponse,
} from '../../common/dto/responses.dto';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}



  @Get()
  @ApiOperation({ summary: 'List all users (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.userService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'User details', type: UserResponse })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponse })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id/kyc')
  @ApiOperation({
    summary: 'Update user KYC status',
    description: 'Updates KYC verification status. Invalidates cached KYC eligibility.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'KYC status updated', type: UserResponse })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponse })
  updateKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKycDto,
  ) {
    return this.userService.updateKycStatus(id, dto);
  }



  @Get(':id/kyc-eligibility')
  @ApiOperation({
    summary: 'Check KYC eligibility for seat reservation',
    description: 'Checks if the user is eligible to reserve a seat based on their KYC status. Uses cached status (30s TTL).',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'KYC eligibility result', type: KycEligibilityResponse })
  @ApiResponse({ status: 404, description: 'User not found', type: ErrorResponse })
  checkKycEligibility(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.checkKycEligibility(id);
  }
}
