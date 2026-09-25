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
import { SkillsService } from './skills.service.js';
import { CreateSkillDto, QuerySkillsDto, UpdateSkillDto, BatchCreateSkillsDto } from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('taxonomy')
  @UseGuards(AuthGuard)
  async getTaxonomy() {
    return this.skillsService.getTaxonomy();
  }

  @Get()
  @UseGuards(AuthGuard)
  async findAll(@Query() query: QuerySkillsDto) {
    const skills = await this.skillsService.findAll(query);
    return {
      count: skills.length,
      skills,
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async findOne(@Param('id') id: string) {
    return this.skillsService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSkillDto) {
    const skill = await this.skillsService.create(dto);
    return {
      message: 'Skill successfully created.',
      skill,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    const skill = await this.skillsService.update(id, dto);
    return {
      message: 'Skill successfully updated.',
      skill,
    };
  }

  @Post('batch')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async batchCreate(@Body() dto: BatchCreateSkillsDto) {
    const result = await this.skillsService.batchCreate(dto.skills);
    return {
      message: `Batch processed: ${result.created.length} created, ${result.existing.length} existing.`,
      ...result,
    };
  }

  @Post('seed')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async seedStandardSkills() {
    return this.skillsService.seedStandardSkills();
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    return this.skillsService.delete(id);
  }
}

