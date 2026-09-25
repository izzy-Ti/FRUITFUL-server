import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { AuthService } from '../auth/auth.service.js';

describe('CategoriesController', () => {
  let controller: CategoriesController;

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

  const mockCategoriesService = {
    findAll: vi.fn().mockResolvedValue([mockCategory]),
    findByIdOrSlug: vi.fn().mockResolvedValue(mockCategory),
    create: vi.fn().mockResolvedValue(mockCategory),
    update: vi.fn().mockResolvedValue({ ...mockCategory, name: 'Engineering' }),
    delete: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' }),
    seedDefaultCategories: vi.fn().mockResolvedValue({ seededCount: 10, message: 'Seeded' }),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: CategoriesService, useValue: mockCategoriesService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    vi.clearAllMocks();
  });

  it('should list all categories', async () => {
    const res = await controller.findAll({});
    expect(res.count).toBe(1);
    expect(res.categories).toEqual([mockCategory]);
  });

  it('should get category by id', async () => {
    const res = await controller.findOne('cat-1');
    expect(res).toEqual(mockCategory);
  });

  it('should create category', async () => {
    const res = await controller.create({ name: 'Software Development' });
    expect(res.message).toContain('created');
    expect(res.category).toEqual(mockCategory);
  });

  it('should update category', async () => {
    const res = await controller.update('cat-1', { name: 'Engineering' });
    expect(res.message).toContain('updated');
    expect(res.category.name).toBe('Engineering');
  });

  it('should delete category', async () => {
    const res = await controller.delete('cat-1');
    expect(res.success).toBe(true);
  });

  it('should seed default categories', async () => {
    const res = await controller.seedDefaults();
    expect(res.seededCount).toBe(10);
  });
});
