import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ControlledDataService } from './controlled-data.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ControlledDataService', () => {
  let service: ControlledDataService;
  let mockPrismaService: any;

  const mockItem = {
    id: 'cd-1',
    category: 'employment_types',
    key: 'full_time',
    label: 'Full Time',
    value: null,
    description: 'Standard 40 hours per week',
    displayOrder: 1,
    isActive: true,
    isSystem: true,
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
            ControlledData: createMockChain(mockItem),
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlledDataService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ControlledDataService>(ControlledDataService);
  });

  it('should find all controlled data', async () => {
    const res = await service.findAll();
    expect(res).toHaveLength(1);
    expect(res[0].key).toBe('full_time');
  });

  it('should get lookup map organized by category', async () => {
    const map = await service.getLookupMap();
    expect(map['employment_types']).toBeDefined();
    expect(map['employment_types'][0].label).toBe('Full Time');
  });

  it('should find item by id', async () => {
    const res = await service.findById('cd-1');
    expect(res.id).toBe('cd-1');
  });

  it('should throw NotFoundException if item does not exist', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(null);
    await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('should create controlled data item', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(null);
    const res = await service.create({
      category: 'workplace_types',
      key: 'remote',
      label: 'Remote',
    });
    expect(mockPrismaService.client.orm.public.ControlledData.create).toHaveBeenCalled();
  });

  it('should throw ConflictException on duplicate key in category', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(mockItem);
    await expect(
      service.create({
        category: 'employment_types',
        key: 'full_time',
        label: 'Full Time',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should update controlled data item', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(mockItem);
    mockPrismaService.client.orm.public.ControlledData.update.mockResolvedValue({
      ...mockItem,
      label: 'Full-Time Position',
    });

    const res = await service.update('cd-1', { label: 'Full-Time Position' });
    expect(res.label).toBe('Full-Time Position');
  });

  it('should prevent deleting system items without force', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(mockItem);
    await expect(service.delete('cd-1', false)).rejects.toThrow(ConflictException);
  });

  it('should allow deleting system items with force', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(mockItem);
    const res = await service.delete('cd-1', true);
    expect(res.success).toBe(true);
  });

  it('should seed standard baseline data', async () => {
    mockPrismaService.client.orm.public.ControlledData.first.mockResolvedValue(null);
    const res = await service.seedStandardData();
    expect(res.seededCount).toBeGreaterThan(0);
  });
});
