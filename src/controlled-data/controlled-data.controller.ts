import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ControlledDataService } from './controlled-data.service.js';
import {
  CreateControlledDataDto,
  UpdateControlledDataDto,
  QueryControlledDataDto,
} from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@Controller('platform-data')
export class ControlledDataController {
  constructor(private readonly controlledDataService: ControlledDataService) {}

  @Get()
  async getLookupMap() {
    return this.controlledDataService.getLookupMap();
  }

  @Get('list')
  async findAll(@Query() query: QueryControlledDataDto) {
    const items = await this.controlledDataService.findAll(query);
    return {
      count: items.length,
      items,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.controlledDataService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateControlledDataDto) {
    const item = await this.controlledDataService.create(dto);
    return {
      message: 'Controlled platform data item successfully created.',
      item,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateControlledDataDto) {
    const item = await this.controlledDataService.update(id, dto);
    return {
      message: 'Controlled platform data item successfully updated.',
      item,
    };
  }

  @Post('seed')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async seedStandardData() {
    return this.controlledDataService.seedStandardData();
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(
    @Param('id') id: string,
    @Query('force') force?: string,
  ) {
    const forceBool = force === 'true';
    return this.controlledDataService.delete(id, forceBool);
  }
}
