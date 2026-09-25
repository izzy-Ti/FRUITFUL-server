import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillsService } from './skills.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('SkillsService', () => {
  let service: SkillsService;

  const mockSkill = {
    id: 'skill-1',
    name: 'TypeScript',
    category: 'Engineering',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          Skill: {
            where: vi.fn(),
            orderBy: vi.fn(),
            limit: vi.fn(),
            all: vi.fn(),
            first: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
          },
        },
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all skills', async () => {
      const mockCollection = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([mockSkill]),
      };
      mockPrismaService.client.orm.public.Skill.orderBy = mockCollection.orderBy;
      mockPrismaService.client.orm.public.Skill.limit = mockCollection.limit;
      mockPrismaService.client.orm.public.Skill.all = mockCollection.all;

      const result = await service.findAll();
      expect(result).toEqual([mockSkill]);
    });
  });

  describe('findById', () => {
    it('should return skill if found', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
      });

      const result = await service.findById('skill-1');
      expect(result).toEqual(mockSkill);
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create skill if name does not exist', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.Skill.create.mockResolvedValue(mockSkill);

      const result = await service.create({ name: 'TypeScript', category: 'Engineering' });
      expect(result).toEqual(mockSkill);
      expect(mockPrismaService.client.orm.public.Skill.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if skill name exists', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
      });

      await expect(
        service.create({ name: 'TypeScript', category: 'Engineering' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOrCreate', () => {
    it('should return existing skill if found', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
      });

      const result = await service.findOrCreate('TypeScript');
      expect(result).toEqual(mockSkill);
      expect(mockPrismaService.client.orm.public.Skill.create).not.toHaveBeenCalled();
    });

    it('should create skill if not found', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.Skill.create.mockResolvedValue(mockSkill);

      const result = await service.findOrCreate('TypeScript');
      expect(result).toEqual(mockSkill);
      expect(mockPrismaService.client.orm.public.Skill.create).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete existing skill', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
        delete: vi.fn().mockResolvedValue({}),
      });

      const result = await service.delete('skill-1');
      expect(result.success).toBe(true);
    });
  });

  describe('update', () => {
    it('should update skill name and category', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
        update: vi.fn().mockResolvedValue({ ...mockSkill, name: 'TypeScript Pro' }),
      });

      const result = await service.update('skill-1', { name: 'TypeScript Pro' });
      expect(result.name).toBe('TypeScript Pro');
    });
  });

  describe('batchCreate', () => {
    it('should process batch skills correctly', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.Skill.create.mockResolvedValue(mockSkill);

      const result = await service.batchCreate([
        { name: 'TypeScript', category: 'Engineering' },
      ]);
      expect(result.created).toHaveLength(1);
    });
  });

  describe('getTaxonomy', () => {
    it('should return skills grouped by category', async () => {
      mockPrismaService.client.orm.public.Skill.orderBy = vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue([mockSkill]),
      });

      const result = await service.getTaxonomy();
      expect(result.totalSkills).toBe(1);
      expect(result.categories['Engineering']).toBeDefined();
    });
  });

  describe('seedStandardSkills', () => {
    it('should seed standard skills', async () => {
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.Skill.create.mockResolvedValue(mockSkill);

      const result = await service.seedStandardSkills();
      expect(result.seededCount).toBeGreaterThan(0);
    });
  });
});

