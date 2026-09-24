import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateSkillDto, QuerySkillsDto } from './dto/index.js';

export interface SkillItem {
  id: string;
  name: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all skills with optional search filter and limit.
   */
  async findAll(query?: QuerySkillsDto): Promise<SkillItem[]> {
    let collection = this.prisma.client.orm.public.Skill;

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((s) => s.name.ilike(term));
    }

    if (query?.category) {
      collection = collection.where((s) => s.category.eq(query.category!));
    }

    const limit = query?.limit || 50;
    return await collection
      .orderBy((s) => s.name.asc())
      .limit(limit)
      .all();
  }

  /**
   * Find a skill by its unique identifier.
   */
  async findById(id: string): Promise<SkillItem> {
    const skill = await this.prisma.client.orm.public.Skill
      .where({ id })
      .first();

    if (!skill) {
      throw new NotFoundException(`Skill with ID "${id}" was not found.`);
    }

    return skill;
  }

  /**
   * Find a skill by name (case-insensitive).
   */
  async findByName(name: string): Promise<SkillItem | null> {
    const trimmed = name.trim();
    return await this.prisma.client.orm.public.Skill
      .where((s) => s.name.ilike(trimmed))
      .first();
  }

  /**
   * Create a new skill in taxonomy.
   */
  async create(dto: CreateSkillDto): Promise<SkillItem> {
    const trimmedName = dto.name.trim();
    const existing = await this.findByName(trimmedName);

    if (existing) {
      throw new ConflictException(`Skill with name "${trimmedName}" already exists.`);
    }

    const newSkill = await this.prisma.client.orm.public.Skill.create({
      id: randomUUID(),
      name: trimmedName,
      category: dto.category?.trim() || null,
    });

    return newSkill;
  }

  /**
   * Find an existing skill by name or create it if absent.
   */
  async findOrCreate(name: string, category?: string): Promise<SkillItem> {
    const trimmed = name.trim();
    const existing = await this.findByName(trimmed);
    if (existing) {
      return existing;
    }

    return await this.prisma.client.orm.public.Skill.create({
      id: randomUUID(),
      name: trimmed,
      category: category?.trim() || null,
    });
  }

  /**
   * Remove a skill by ID.
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    await this.findById(id);

    await this.prisma.client.orm.public.Skill
      .where({ id })
      .delete();

    return {
      success: true,
      message: `Skill with ID "${id}" has been removed.`,
    };
  }
}
