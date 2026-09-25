import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateSkillDto, QuerySkillsDto, UpdateSkillDto } from './dto/index.js';

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
   * Update an existing skill.
   */
  async update(id: string, dto: UpdateSkillDto): Promise<SkillItem> {
    const skill = await this.findById(id);

    if (dto.name && dto.name.trim().toLowerCase() !== skill.name.toLowerCase()) {
      const existing = await this.findByName(dto.name.trim());
      if (existing && existing.id !== id) {
        throw new ConflictException(`Skill with name "${dto.name.trim()}" already exists.`);
      }
    }

    const updated = await this.prisma.client.orm.public.Skill
      .where({ id })
      .update({
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category ? dto.category.trim() : null } : {}),
      });

    if (!updated) {
      throw new NotFoundException(`Skill "${id}" could not be updated.`);
    }

    return updated;
  }

  /**
   * Batch create multiple skills.
   */
  async batchCreate(skills: Array<{ name: string; category?: string }>): Promise<{ created: SkillItem[]; existing: SkillItem[] }> {
    const created: SkillItem[] = [];
    const existing: SkillItem[] = [];

    for (const item of skills) {
      const trimmed = item.name.trim();
      const found = await this.findByName(trimmed);
      if (found) {
        existing.push(found);
      } else {
        const newSkill = await this.prisma.client.orm.public.Skill.create({
          id: randomUUID(),
          name: trimmed,
          category: item.category?.trim() || null,
        });
        created.push(newSkill);
      }
    }

    return { created, existing };
  }

  /**
   * Get skills taxonomy grouped by category.
   */
  async getTaxonomy(): Promise<{ totalSkills: number; categories: Record<string, SkillItem[]> }> {
    const all = await this.prisma.client.orm.public.Skill
      .orderBy((s) => s.name.asc())
      .all();

    const categories: Record<string, SkillItem[]> = {};

    for (const skill of all) {
      const cat = skill.category || 'General';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(skill);
    }

    return {
      totalSkills: all.length,
      categories,
    };
  }

  /**
   * Seed standard curated skills taxonomy if absent.
   */
  async seedStandardSkills(): Promise<{ seededCount: number; message: string }> {
    const standardSkills: Array<{ name: string; category: string }> = [
      // Software Development & Engineering
      { name: 'TypeScript', category: 'Software Development' },
      { name: 'JavaScript', category: 'Software Development' },
      { name: 'Node.js', category: 'Software Development' },
      { name: 'React', category: 'Software Development' },
      { name: 'Next.js', category: 'Software Development' },
      { name: 'Python', category: 'Software Development' },
      { name: 'PostgreSQL', category: 'Software Development' },
      { name: 'Docker', category: 'Software Development' },
      { name: 'GraphQL', category: 'Software Development' },
      { name: 'Go', category: 'Software Development' },
      { name: 'Rust', category: 'Software Development' },
      { name: 'NestJS', category: 'Software Development' },

      // Data & AI
      { name: 'Machine Learning', category: 'Data & AI' },
      { name: 'PyTorch', category: 'Data & AI' },
      { name: 'TensorFlow', category: 'Data & AI' },
      { name: 'Data Engineering', category: 'Data & AI' },
      { name: 'Pandas', category: 'Data & AI' },
      { name: 'SQL', category: 'Data & AI' },

      // Design & Creative
      { name: 'UI/UX Design', category: 'Design & Creative' },
      { name: 'Figma', category: 'Design & Creative' },
      { name: 'Wireframing', category: 'Design & Creative' },
      { name: 'Design Systems', category: 'Design & Creative' },

      // Product & Operations
      { name: 'Product Management', category: 'Product & Project' },
      { name: 'Agile & Scrum', category: 'Product & Project' },
      { name: 'Jira', category: 'Product & Project' },

      // Marketing & Sales
      { name: 'Digital Marketing', category: 'Sales & Marketing' },
      { name: 'SEO Optimization', category: 'Sales & Marketing' },
      { name: 'Content Strategy', category: 'Sales & Marketing' },
    ];

    let count = 0;
    for (const item of standardSkills) {
      const exists = await this.findByName(item.name);
      if (!exists) {
        await this.prisma.client.orm.public.Skill.create({
          id: randomUUID(),
          name: item.name,
          category: item.category,
        });
        count++;
      }
    }

    return {
      seededCount: count,
      message: `Seeded ${count} standard skills.`,
    };
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

