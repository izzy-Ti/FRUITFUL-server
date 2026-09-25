import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoriesService } from './categories.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockPrismaService: any;

  const mockCategory = {
    id: 'cat-1',
    name: 'Software Development',
    slug: 'software-development',
    description: 'Engineering and programming',
    icon: 'code',
    isActive: true,
    displayOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const createMockChain = (defaultItem: any) => {
      const chain: any = {};
      chain.where = vi.fn().mockImplementation(() => chain);
      chain.orderBy = vi.fn().mockImplementation(() => chain);
      chain.all = vi.fn().mockResolvedValue([defaultItem]);
      chain.first = vi.fn().mockResolvedValue(defaultItem);
      chain.create = vi.fn().mockResolvedValue(defaultItem);
      chain.update = vi.fn().mockResolvedValue(defaultItem);
      chain.delete = vi.fn().mockResolvedValue({});
      return chain;
    };

    mockPrismaService = {
      client: {
        orm: {
          public: {
            Category: createMockChain(mockCategory),
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should list all categories', async () => {
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Software Development');
  });

  it('should find category by ID or slug', async () => {
    const result = await service.findByIdOrSlug('cat-1');
    expect(result.id).toBe('cat-1');
  });

  it('should throw NotFoundException if category not found', async () => {
    mockPrismaService.client.orm.public.Category.first.mockResolvedValue(null);
    await expect(service.findByIdOrSlug('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('should create a category', async () => {
    mockPrismaService.client.orm.public.Category.first.mockResolvedValue(null);
    const result = await service.create({
      name: 'Design & Creative',
    });
    expect(mockPrismaService.client.orm.public.Category.create).toHaveBeenCalled();
  });

  it('should throw ConflictException when creating existing category name', async () => {
    mockPrismaService.client.orm.public.Category.first.mockResolvedValue(mockCategory);
    await expect(
      service.create({
        name: 'Software Development',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should update a category', async () => {
    mockPrismaService.client.orm.public.Category.first
      .mockResolvedValueOnce(mockCategory) // find existing
      .mockResolvedValueOnce(null); // name collision check

    mockPrismaService.client.orm.public.Category.update.mockResolvedValue({
      ...mockCategory,
      description: 'Updated description',
    });

    const result = await service.update('cat-1', { description: 'Updated description' });
    expect(result.description).toBe('Updated description');
  });

  it('should delete a category', async () => {
    mockPrismaService.client.orm.public.Category.first.mockResolvedValue(mockCategory);
    const result = await service.delete('cat-1');
    expect(result.success).toBe(true);
    expect(mockPrismaService.client.orm.public.Category.delete).toHaveBeenCalled();
  });

  it('should seed default categories if not present', async () => {
    mockPrismaService.client.orm.public.Category.first.mockResolvedValue(null);
    const result = await service.seedDefaultCategories();
    expect(result.seededCount).toBe(10);
  });
});
