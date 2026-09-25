import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto.js';
import { UpdateSavedSearchDto } from './dto/update-saved-search.dto.js';
import { QuerySavedSearchesDto } from './dto/query-saved-searches.dto.js';

@Injectable()
export class SavedSearchesService {
  private readonly logger = new Logger(SavedSearchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // CREATE
  // =========================================================================

  async create(userId: string, dto: CreateSavedSearchDto) {
    const id = randomUUID();
    const filtersJson = JSON.stringify(dto.filters);

    const saved = await this.prisma.client.orm.public.SavedSearch.create({
      id,
      userId,
      title: dto.title,
      type: dto.type,
      filters: filtersJson,
      alertFrequency: dto.alertFrequency ?? 'daily',
      isActive: dto.isActive ?? true,
      lastNotifiedAt: null,
    });

    return this.deserialize(saved);
  }

  // =========================================================================
  // READ
  // =========================================================================

  async findAll(userId: string, query: QuerySavedSearchesDto) {
    const { type, isActive, page = 1, limit = 20 } = query;

    let collection = this.prisma.client.orm.public.SavedSearch.where({ userId });

    if (type !== undefined) {
      collection = collection.where((s) => s.type.eq(type));
    }
    if (isActive !== undefined) {
      collection = collection.where((s) => s.isActive.eq(isActive));
    }

    const all = await collection.orderBy((s) => s.createdAt.desc()).all();
    const total = all.length;
    const paginated = all.slice((page - 1) * limit, page * limit);

    return {
      data: paginated.map((s) => this.deserialize(s)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, id: string) {
    const saved = await this.prisma.client.orm.public.SavedSearch.first({ id });
    if (!saved) {
      throw new NotFoundException('Saved search not found.');
    }
    if (saved.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }
    return this.deserialize(saved);
  }

  // =========================================================================
  // UPDATE
  // =========================================================================

  async update(userId: string, id: string, dto: UpdateSavedSearchDto) {
    const existing = await this.prisma.client.orm.public.SavedSearch.first({ id });
    if (!existing) {
      throw new NotFoundException('Saved search not found.');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData['title'] = dto.title;
    if (dto.filters !== undefined) updateData['filters'] = JSON.stringify(dto.filters);
    if (dto.alertFrequency !== undefined) updateData['alertFrequency'] = dto.alertFrequency;
    if (dto.isActive !== undefined) updateData['isActive'] = dto.isActive;

    const updated = await this.prisma.client.orm.public.SavedSearch
      .where({ id })
      .update(updateData);

    return this.deserialize(updated);
  }

  // =========================================================================
  // DELETE
  // =========================================================================

  async remove(userId: string, id: string) {
    const existing = await this.prisma.client.orm.public.SavedSearch.first({ id });
    if (!existing) {
      throw new NotFoundException('Saved search not found.');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    await this.prisma.client.orm.public.SavedSearch.where({ id }).delete();
    return { message: 'Saved search deleted successfully.' };
  }

  // =========================================================================
  // INTERNAL / ALERT HELPERS
  // =========================================================================

  /**
   * Marks a saved search as notified (for alert scheduling).
   */
  async markNotified(id: string) {
    await this.prisma.client.orm.public.SavedSearch
      .where({ id })
      .update({ lastNotifiedAt: new Date().toISOString() });
  }

  /**
   * Returns all active saved searches that are due for alert dispatch.
   * Intended to be called by a future cron / scheduler.
   */
  async findDueAlerts(frequency: 'daily' | 'weekly' | 'immediately') {
    const saves = await this.prisma.client.orm.public.SavedSearch
      .where({ isActive: true })
      .where((s) => s.alertFrequency.eq(frequency))
      .orderBy((s) => s.lastNotifiedAt.asc())
      .all();
    return saves.map((s) => this.deserialize(s));
  }

  // =========================================================================
  // SERIALISATION
  // =========================================================================

  private deserialize(row: any) {
    let filters: Record<string, unknown> = {};
    try {
      filters = JSON.parse(row.filters || '{}');
    } catch {
      this.logger.warn(`Failed to parse filters JSON for SavedSearch ${row.id}`);
    }
    return { ...row, filters };
  }
}
