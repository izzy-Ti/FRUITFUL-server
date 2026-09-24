import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkillsService } from './skills.service.js';
import { CreateSkillDto, QuerySkillsDto } from './dto/index.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../common/enums/role.enum.js';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

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
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSkillDto) {
    const skill = await this.skillsService.create(dto);
    return {
      message: 'Skill successfully created.',
      skill,
    };
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string) {
    return this.skillsService.delete(id);
  }
}
