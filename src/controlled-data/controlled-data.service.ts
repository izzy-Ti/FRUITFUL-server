import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateControlledDataDto, UpdateControlledDataDto, QueryControlledDataDto } from './dto/index.js';

export interface ControlledDataItem {
  id: string;
  category: string;
  key: string;
  label: string;
  value: string | null;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ControlledDataService {
  private readonly logger = new Logger(ControlledDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all controlled data with optional category, active status, and search filters.
   */
  async findAll(query?: QueryControlledDataDto): Promise<ControlledDataItem[]> {
    let collection = this.prisma.client.orm.public.ControlledData;

    if (query?.category) {
      collection = collection.where((d) => d.category.eq(query.category!.trim().toLowerCase()));
    }

    if (query?.isActive !== undefined) {
      const activeBool = query.isActive === 'true';
      collection = collection.where((d) => d.isActive.eq(activeBool));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((d) => d.label.ilike(term));
    }

    return await collection
      .orderBy((d) => d.displayOrder.asc())
      .all();
  }

  /**
   * Retrieve active controlled data items organized as a clean lookup map for platform UI dropdowns.
   */
  async getLookupMap(): Promise<Record<string, Array<{ key: string; label: string; value?: string | null; description?: string | null }>>> {
    const items = await this.prisma.client.orm.public.ControlledData
      .where((d) => d.isActive.eq(true))
      .orderBy((d) => d.displayOrder.asc())
      .all();

    const lookupMap: Record<string, Array<{ key: string; label: string; value?: string | null; description?: string | null }>> = {};

    for (const item of items) {
      if (!lookupMap[item.category]) {
        lookupMap[item.category] = [];
      }
      lookupMap[item.category].push({
        key: item.key,
        label: item.label,
        value: item.value,
        description: item.description,
      });
    }

    return lookupMap;
  }

  /**
   * Find a controlled data record by ID.
   */
  async findById(id: string): Promise<ControlledDataItem> {
    const item = await this.prisma.client.orm.public.ControlledData
      .where({ id })
      .first();

    if (!item) {
      throw new NotFoundException(`Controlled data item with ID "${id}" was not found.`);
    }

    return item;
  }

  /**
   * Create a new controlled platform data item.
   */
  async create(dto: CreateControlledDataDto): Promise<ControlledDataItem> {
    const category = dto.category.trim().toLowerCase();
    const key = dto.key.trim().toLowerCase();

    const existing = await this.prisma.client.orm.public.ControlledData
      .where({ category, key })
      .first();

    if (existing) {
      throw new ConflictException(`Controlled data item for "${category}:${key}" already exists.`);
    }

    const newItem = await this.prisma.client.orm.public.ControlledData.create({
      id: randomUUID(),
      category,
      key,
      label: dto.label.trim(),
      value: dto.value?.trim() || null,
      description: dto.description?.trim() || null,
      displayOrder: dto.displayOrder !== undefined ? dto.displayOrder : 0,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      isSystem: dto.isSystem !== undefined ? dto.isSystem : false,
    });

    this.logger.log(`Created controlled data item: ${newItem.category}:${newItem.key}`);
    return newItem;
  }

  /**
   * Update a controlled data item.
   */
  async update(id: string, dto: UpdateControlledDataDto): Promise<ControlledDataItem> {
    const existing = await this.findById(id);

    const updated = await this.prisma.client.orm.public.ControlledData
      .where({ id: existing.id })
      .update({
        ...(dto.label ? { label: dto.label.trim() } : {}),
        ...(dto.value !== undefined ? { value: dto.value ? dto.value.trim() : null } : {}),
        ...(dto.description !== undefined ? { description: dto.description ? dto.description.trim() : null } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      });

    if (!updated) {
      throw new NotFoundException(`Controlled data item "${id}" could not be updated.`);
    }

    return updated;
  }

  /**
   * Delete a controlled data item (system items protected).
   */
  async delete(id: string, force = false): Promise<{ success: boolean; message: string }> {
    const item = await this.findById(id);

    if (item.isSystem && !force) {
      throw new ConflictException(`System controlled item "${item.category}:${item.key}" cannot be removed.`);
    }

    await this.prisma.client.orm.public.ControlledData
      .where({ id: item.id })
      .delete();

    return {
      success: true,
      message: `Controlled data item "${item.category}:${item.key}" has been removed.`,
    };
  }

  /**
   * Seed standard baseline controlled data.
   */
  async seedStandardData(): Promise<{ seededCount: number; message: string }> {
    const baselineData: Array<{ category: string; key: string; label: string; description?: string; displayOrder: number; isSystem: boolean }> = [
      // Employment Types
      { category: 'employment_types', key: 'full_time', label: 'Full Time', description: 'Standard 40 hours per week role', displayOrder: 1, isSystem: true },
      { category: 'employment_types', key: 'part_time', label: 'Part Time', description: 'Under 30 hours per week role', displayOrder: 2, isSystem: true },
      { category: 'employment_types', key: 'contract', label: 'Contract', description: 'Fixed-term or project-based agreement', displayOrder: 3, isSystem: true },
      { category: 'employment_types', key: 'internship', label: 'Internship', description: 'Training and internship positions', displayOrder: 4, isSystem: true },
      { category: 'employment_types', key: 'freelance', label: 'Freelance / Gig', description: 'Independent contractor work', displayOrder: 5, isSystem: true },

      // Workplace Types
      { category: 'workplace_types', key: 'remote', label: 'Remote', description: 'Work entirely from home or anywhere', displayOrder: 1, isSystem: true },
      { category: 'workplace_types', key: 'hybrid', label: 'Hybrid', description: 'Splits time between office and remote', displayOrder: 2, isSystem: true },
      { category: 'workplace_types', key: 'on_site', label: 'On-site', description: 'Physically present at employer location', displayOrder: 3, isSystem: true },

      // Experience Levels
      { category: 'experience_levels', key: 'entry', label: 'Entry Level (0-2 yrs)', description: 'Junior or early-career talent', displayOrder: 1, isSystem: true },
      { category: 'experience_levels', key: 'mid', label: 'Mid Level (3-5 yrs)', description: 'Established professional experience', displayOrder: 2, isSystem: true },
      { category: 'experience_levels', key: 'senior', label: 'Senior Level (6-8 yrs)', description: 'Advanced domain execution and mentoring', displayOrder: 3, isSystem: true },
      { category: 'experience_levels', key: 'lead', label: 'Lead / Principal (8+ yrs)', description: 'Team leadership and technical architecture', displayOrder: 4, isSystem: true },
      { category: 'experience_levels', key: 'executive', label: 'Executive / Director', description: 'Director, VP, or C-suite management', displayOrder: 5, isSystem: true },

      // Currencies
      { category: 'currencies', key: 'USD', label: 'US Dollar ($)', description: 'United States Dollar', displayOrder: 1, isSystem: true },
      { category: 'currencies', key: 'ETB', label: 'Ethiopian Birr (ETB)', description: 'Ethiopian Birr', displayOrder: 2, isSystem: true },
      { category: 'currencies', key: 'EUR', label: 'Euro (€)', description: 'European Union Currency', displayOrder: 3, isSystem: true },
      { category: 'currencies', key: 'GBP', label: 'British Pound (£)', description: 'Great Britain Pound', displayOrder: 4, isSystem: true },
      { category: 'currencies', key: 'KES', label: 'Kenyan Shilling (KES)', description: 'Kenyan Shilling', displayOrder: 5, isSystem: true },

      // Education Degrees
      { category: 'education_degrees', key: 'high_school', label: 'High School Diploma', displayOrder: 1, isSystem: true },
      { category: 'education_degrees', key: 'diploma', label: 'Associate / Vocational Diploma', displayOrder: 2, isSystem: true },
      { category: 'education_degrees', key: 'bachelor', label: "Bachelor's Degree (BSc, BA)", displayOrder: 3, isSystem: true },
      { category: 'education_degrees', key: 'master', label: "Master's Degree (MSc, MA, MBA)", displayOrder: 4, isSystem: true },
      { category: 'education_degrees', key: 'doctorate', label: 'Doctorate / PhD', displayOrder: 5, isSystem: true },
      { category: 'education_degrees', key: 'certification', label: 'Professional Certificate / License', displayOrder: 6, isSystem: true },

      // Industries
      { category: 'industries', key: 'technology', label: 'Technology & Software', displayOrder: 1, isSystem: true },
      { category: 'industries', key: 'fintech_banking', label: 'FinTech & Financial Services', displayOrder: 2, isSystem: true },
      { category: 'industries', key: 'healthcare', label: 'Healthcare & Biotech', displayOrder: 3, isSystem: true },
      { category: 'industries', key: 'education', label: 'Education & EdTech', displayOrder: 4, isSystem: true },
      { category: 'industries', key: 'ecommerce_retail', label: 'E-commerce & Retail', displayOrder: 5, isSystem: true },
      { category: 'industries', key: 'agriculture', label: 'Agriculture & AgTech', displayOrder: 6, isSystem: true },
      { category: 'industries', key: 'telecom', label: 'Telecommunications', displayOrder: 7, isSystem: true },

      // Application Stages
      { category: 'application_stages', key: 'submitted', label: 'Submitted', description: 'Application filed and pending initial review', displayOrder: 1, isSystem: true },
      { category: 'application_stages', key: 'reviewing', label: 'Under Review', description: 'Employer is evaluating application', displayOrder: 2, isSystem: true },
      { category: 'application_stages', key: 'shortlisted', label: 'Shortlisted', description: 'Candidate advanced to candidate pool', displayOrder: 3, isSystem: true },
      { category: 'application_stages', key: 'interviewing', label: 'Interviewing', description: 'Active interview process in progress', displayOrder: 4, isSystem: true },
      { category: 'application_stages', key: 'offered', label: 'Offer Extended', description: 'Formal offer made to candidate', displayOrder: 5, isSystem: true },
      { category: 'application_stages', key: 'hired', label: 'Hired / Accepted', description: 'Candidate hired for role', displayOrder: 6, isSystem: true },
      { category: 'application_stages', key: 'rejected', label: 'Rejected', description: 'Candidate not selected', displayOrder: 7, isSystem: true },
      { category: 'application_stages', key: 'withdrawn', label: 'Withdrawn', description: 'Candidate withdrew application', displayOrder: 8, isSystem: true },
    ];

    let count = 0;
    for (const item of baselineData) {
      const existing = await this.prisma.client.orm.public.ControlledData
        .where({ category: item.category, key: item.key })
        .first();

      if (!existing) {
        await this.prisma.client.orm.public.ControlledData.create({
          id: randomUUID(),
          category: item.category,
          key: item.key,
          label: item.label,
          description: item.description || null,
          displayOrder: item.displayOrder,
          isActive: true,
          isSystem: item.isSystem,
        });
        count++;
      }
    }

    return {
      seededCount: count,
      message: `Seeded ${count} controlled platform data records.`,
    };
  }
}
