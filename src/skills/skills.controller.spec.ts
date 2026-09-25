import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';
import { AuthService } from '../auth/auth.service.js';

describe('SkillsController', () => {
  let controller: SkillsController;
  let service: SkillsService;

  const mockSkill = {
    id: 'skill-1',
    name: 'NestJS',
    category: 'Backend',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSkillsService = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [
        { provide: SkillsService, useValue: mockSkillsService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<SkillsController>(SkillsController);
    service = module.get<SkillsService>(SkillsService);
    vi.clearAllMocks();
  });

  it('should list all skills', async () => {
    mockSkillsService.findAll.mockResolvedValue([mockSkill]);

    const res = await controller.findAll({});
    expect(res.count).toBe(1);
    expect(res.skills).toEqual([mockSkill]);
  });

  it('should get a skill by id', async () => {
    mockSkillsService.findById.mockResolvedValue(mockSkill);

    const res = await controller.findOne('skill-1');
    expect(res).toEqual(mockSkill);
  });

  it('should create a skill', async () => {
    mockSkillsService.create.mockResolvedValue(mockSkill);

    const res = await controller.create({ name: 'NestJS', category: 'Backend' });
    expect(res.message).toBe('Skill successfully created.');
    expect(res.skill).toEqual(mockSkill);
  });

  it('should delete a skill', async () => {
    mockSkillsService.delete.mockResolvedValue({ success: true, message: 'Skill deleted' });

    const res = await controller.delete('skill-1');
    expect(res.success).toBe(true);
  });

  it('should update a skill', async () => {
    mockSkillsService.update = vi.fn().mockResolvedValue({ ...mockSkill, name: 'NestJS Pro' });

    const res = await controller.update('skill-1', { name: 'NestJS Pro' });
    expect(res.message).toBe('Skill successfully updated.');
    expect(res.skill.name).toBe('NestJS Pro');
  });

  it('should get skills taxonomy', async () => {
    mockSkillsService.getTaxonomy = vi.fn().mockResolvedValue({ totalSkills: 1, categories: {} });

    const res = await controller.getTaxonomy();
    expect(res.totalSkills).toBe(1);
  });

  it('should batch create skills', async () => {
    mockSkillsService.batchCreate = vi.fn().mockResolvedValue({ created: [mockSkill], existing: [] });

    const res = await controller.batchCreate({ skills: [{ name: 'NestJS' }] });
    expect(res.created).toHaveLength(1);
  });

  it('should seed standard skills', async () => {
    mockSkillsService.seedStandardSkills = vi.fn().mockResolvedValue({ seededCount: 15, message: 'Seeded' });

    const res = await controller.seedStandardSkills();
    expect(res.seededCount).toBe(15);
  });
});

