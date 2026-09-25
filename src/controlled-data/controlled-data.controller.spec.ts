import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ControlledDataController } from './controlled-data.controller.js';
import { ControlledDataService } from './controlled-data.service.js';
import { AuthService } from '../auth/auth.service.js';

describe('ControlledDataController', () => {
  let controller: ControlledDataController;

  const mockItem = {
    id: 'cd-1',
    category: 'employment_types',
    key: 'full_time',
    label: 'Full Time',
    value: null,
    description: null,
    displayOrder: 1,
    isActive: true,
    isSystem: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockControlledDataService = {
    getLookupMap: vi.fn().mockResolvedValue({
      employment_types: [{ key: 'full_time', label: 'Full Time' }],
    }),
    findAll: vi.fn().mockResolvedValue([mockItem]),
    findById: vi.fn().mockResolvedValue(mockItem),
    create: vi.fn().mockResolvedValue(mockItem),
    update: vi.fn().mockResolvedValue({ ...mockItem, label: 'Full Time Position' }),
    delete: vi.fn().mockResolvedValue({ success: true, message: 'Deleted' }),
    seedStandardData: vi.fn().mockResolvedValue({ seededCount: 20, message: 'Seeded' }),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControlledDataController],
      providers: [
        { provide: ControlledDataService, useValue: mockControlledDataService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<ControlledDataController>(ControlledDataController);
    vi.clearAllMocks();
  });

  it('should return lookup map', async () => {
    const res = await controller.getLookupMap();
    expect(res.employment_types).toBeDefined();
  });

  it('should list all items', async () => {
    const res = await controller.findAll({});
    expect(res.count).toBe(1);
    expect(res.items).toEqual([mockItem]);
  });

  it('should find one item by id', async () => {
    const res = await controller.findOne('cd-1');
    expect(res).toEqual(mockItem);
  });

  it('should create controlled data item', async () => {
    const res = await controller.create({
      category: 'workplace_types',
      key: 'remote',
      label: 'Remote',
    });
    expect(res.message).toContain('created');
  });

  it('should update controlled data item', async () => {
    const res = await controller.update('cd-1', { label: 'Full Time Position' });
    expect(res.message).toContain('updated');
  });

  it('should delete controlled data item', async () => {
    const res = await controller.delete('cd-1', 'true');
    expect(res.success).toBe(true);
  });

  it('should seed standard data', async () => {
    const res = await controller.seedStandardData();
    expect(res.seededCount).toBe(20);
  });
});
