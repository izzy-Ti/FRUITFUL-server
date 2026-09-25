import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateCategoryDto, UpdateCategoryDto, QueryCategoryDto } from './dto/index.js';

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate slug from name.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * List all categories with optional search and active status filters.
   */
  async findAll(query?: QueryCategoryDto): Promise<CategoryItem[]> {
    let collection = this.prisma.client.orm.public.Category;

    if (query?.isActive !== undefined) {
      const activeBool = query.isActive === 'true';
      collection = collection.where((c) => c.isActive.eq(activeBool));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((c) => c.name.ilike(term));
    }

    return await collection
      .orderBy((c) => c.displayOrder.asc())
      .all();
  }

  /**
   * Find a category by ID or unique slug.
   */
  async findByIdOrSlug(idOrSlug: string): Promise<CategoryItem> {
    const trimmed = idOrSlug.trim();
    let category = await this.prisma.client.orm.public.Category
      .where({ id: trimmed })
      .first();

    if (!category) {
      category = await this.prisma.client.orm.public.Category
        .where({ slug: trimmed.toLowerCase() })
        .first();
    }

    if (!category) {
      throw new NotFoundException(`Category "${idOrSlug}" was not found.`);
    }

    return category;
  }

  /**
   * Create a new category.
   */
  async create(dto: CreateCategoryDto): Promise<CategoryItem> {
    const trimmedName = dto.name.trim();
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(trimmedName);

    const existingName = await this.prisma.client.orm.public.Category
      .where({ name: trimmedName })
      .first();

    if (existingName) {
      throw new ConflictException(`Category with name "${trimmedName}" already exists.`);
    }

    const existingSlug = await this.prisma.client.orm.public.Category
      .where({ slug })
      .first();

    if (existingSlug) {
      throw new ConflictException(`Category with slug "${slug}" already exists.`);
    }

    const newCategory = await this.prisma.client.orm.public.Category.create({
      id: randomUUID(),
      name: trimmedName,
      slug,
      description: dto.description?.trim() || null,
      icon: dto.icon?.trim() || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : 0,
    });

    this.logger.log(`Created category: ${newCategory.name} (${newCategory.slug})`);
    return newCategory;
  }

  /**
   * Update category properties.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryItem> {
    const existing = await this.findByIdOrSlug(id);

    if (dto.name && dto.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const match = await this.prisma.client.orm.public.Category
        .where({ name: dto.name.trim() })
        .first();
      if (match && match.id !== existing.id) {
        throw new ConflictException(`Category with name "${dto.name.trim()}" already exists.`);
      }
    }

    let slug = existing.slug;
    if (dto.slug && dto.slug.trim() !== existing.slug) {
      slug = this.slugify(dto.slug);
      const matchSlug = await this.prisma.client.orm.public.Category
        .where({ slug })
        .first();
      if (matchSlug && matchSlug.id !== existing.id) {
        throw new ConflictException(`Category with slug "${slug}" already exists.`);
      }
    }

    const updated = await this.prisma.client.orm.public.Category
      .where({ id: existing.id })
      .update({
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.slug ? { slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description ? dto.description.trim() : null } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon ? dto.icon.trim() : null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      });

    if (!updated) {
      throw new NotFoundException(`Category "${id}" could not be updated.`);
    }

    return updated;
  }

  /**
   * Delete category by ID.
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const category = await this.findByIdOrSlug(id);

    await this.prisma.client.orm.public.Category
      .where({ id: category.id })
      .delete();

    return {
      success: true,
      message: `Category "${category.name}" has been removed.`,
    };
  }

  /**
   * Seed standard curated categories.
   */
  async seedDefaultCategories(): Promise<{ seededCount: number; message: string }> {
    const standardCategories = [
      { name: 'Software Development', slug: 'software-development', icon: 'code', displayOrder: 1, description: 'Engineering, web, mobile, and systems programming' },
      { name: 'Data & Artificial Intelligence', slug: 'data-ai', icon: 'brain', displayOrder: 2, description: 'Data science, machine learning, and analytics' },
      { name: 'Design & Creative', slug: 'design-creative', icon: 'palette', displayOrder: 3, description: 'UI/UX design, brand identity, and media design' },
      { name: 'Product & Project Management', slug: 'product-management', icon: 'kanban', displayOrder: 4, description: 'Product strategy, agile delivery, and project coordination' },
      { name: 'Sales & Marketing', slug: 'sales-marketing', icon: 'trending-up', displayOrder: 5, description: 'Growth, digital marketing, sales, and SEO' },
      { name: 'Customer Support & Operations', slug: 'customer-operations', icon: 'headphones', displayOrder: 6, description: 'Customer success, help desk, and business operations' },
      { name: 'Finance & Accounting', slug: 'finance-accounting', icon: 'dollar-sign', displayOrder: 7, description: 'Financial planning, accounting, and compliance' },
      { name: 'Human Resources & Recruiting', slug: 'human-resources', icon: 'users', displayOrder: 8, description: 'People operations, talent acquisition, and training' },
      { name: 'Healthcare & Life Sciences', slug: 'healthcare', icon: 'activity', displayOrder: 9, description: 'Medical research, clinical, and health technology' },
      { name: 'Education & Training', slug: 'education-training', icon: 'book-open', displayOrder: 10, description: 'Instructional design, tutoring, and curriculum creation' },
    ];

    let count = 0;
    for (const cat of standardCategories) {
      const existing = await this.prisma.client.orm.public.Category
        .where({ slug: cat.slug })
        .first();

      if (!existing) {
        await this.prisma.client.orm.public.Category.create({
          id: randomUUID(),
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          icon: cat.icon,
          displayOrder: cat.displayOrder,
          isActive: true,
        });
        count++;
      }
    }

    return {
      seededCount: count,
      message: `Seeded ${count} standard categories.`,
    };
  }
}
