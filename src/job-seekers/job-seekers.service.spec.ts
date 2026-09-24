import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobSeekersService } from './job-seekers.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { PrismaService } from '../database/prisma.service.js';

describe('JobSeekersService', () => {
  let service: JobSeekersService;

  const mockUser = {
    id: 'user-1',
    email: 'seeker@example.com',
    name: 'Jane Doe',
    role: 'job_seeker',
  };

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    headline: 'Senior Software Engineer',
    photoUrl: 'https://example.com/photo.jpg',
    bio: 'Passionate developer',
    location: 'Nairobi, Kenya',
    phone: '+254700000000',
    cvUrl: 'https://example.com/cv.pdf',
    languages: ['English', 'Swahili'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockEducation = {
    id: 'edu-1',
    profileId: 'profile-1',
    institution: 'University of Nairobi',
    degree: 'BSc Computer Science',
    fieldOfStudy: 'Computer Science',
    startDate: '2018-09',
    endDate: '2022-06',
    isCurrent: false,
    description: 'First Class Honors',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockExperience = {
    id: 'exp-1',
    profileId: 'profile-1',
    title: 'Software Developer',
    company: 'Tech Safari',
    location: 'Nairobi',
    employmentType: 'Full-time',
    startDate: '2022-07',
    endDate: null,
    isCurrent: true,
    description: 'Developing cloud applications',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSkill = {
    id: 'skill-1',
    name: 'TypeScript',
    category: 'Engineering',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProfileSkill = {
    id: 'ps-1',
    profileId: 'profile-1',
    skillId: 'skill-1',
    level: 'advanced',
    yearsOfExperience: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPrismaService = {
    client: {
      orm: {
        public: {
          User: {
            where: vi.fn(),
          },
          JobSeekerProfile: {
            where: vi.fn(),
            create: vi.fn(),
            all: vi.fn(),
          },
          EducationRecord: {
            where: vi.fn(),
            create: vi.fn(),
          },
          ExperienceRecord: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Skill: {
            where: vi.fn(),
          },
          ProfileSkill: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    },
  };

  const mockSkillsService = {
    findById: vi.fn(),
    findOrCreate: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobSeekersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SkillsService, useValue: mockSkillsService },
      ],
    }).compile();

    service = module.get<JobSeekersService>(JobSeekersService);
    vi.clearAllMocks();
  });

  describe('getFullProfileByUserId', () => {
    it('should assemble and return the full profile', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
      });

      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      mockPrismaService.client.orm.public.EducationRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue([mockEducation]),
        }),
      });

      mockPrismaService.client.orm.public.ExperienceRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue([mockExperience]),
        }),
      });

      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockProfileSkill]),
      });

      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
      });

      const result = await service.getFullProfileByUserId('user-1');

      expect(result.id).toBe('profile-1');
      expect(result.headline).toBe('Senior Software Engineer');
      expect(result.education).toHaveLength(1);
      expect(result.experience).toHaveLength(1);
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('TypeScript');
      expect(result.user?.name).toBe('Jane Doe');
    });
  });

  describe('upsertProfile', () => {
    it('should update profile if it exists', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
        update: vi.fn().mockResolvedValue({ ...mockProfile, bio: 'Updated bio' }),
      });

      vi.spyOn(service, 'getFullProfileByUserId').mockResolvedValue({
        ...mockProfile,
        bio: 'Updated bio',
        education: [],
        experience: [],
        skills: [],
      } as any);

      const result = await service.upsertProfile('user-1', { bio: 'Updated bio' });
      expect(result.bio).toBe('Updated bio');
    });

    it('should create profile if it does not exist', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.JobSeekerProfile.create.mockResolvedValue(mockProfile);

      vi.spyOn(service, 'getFullProfileByUserId').mockResolvedValue({
        ...mockProfile,
        education: [],
        experience: [],
        skills: [],
      } as any);

      const result = await service.upsertProfile('user-1', { headline: 'Developer' });
      expect(result.headline).toBe('Senior Software Engineer');
      expect(mockPrismaService.client.orm.public.JobSeekerProfile.create).toHaveBeenCalled();
    });
  });

  describe('Education operations', () => {
    it('should add education record', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.EducationRecord.create.mockResolvedValue(mockEducation);

      const result = await service.addEducation('user-1', {
        institution: 'University of Nairobi',
        degree: 'BSc Computer Science',
        startDate: '2018-09',
      });

      expect(result).toEqual(mockEducation);
    });

    it('should prevent unauthorized deletion of education', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.EducationRecord.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockEducation, profileId: 'other-profile' }),
      });

      await expect(service.deleteEducation('user-1', 'edu-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Experience operations', () => {
    it('should add experience record', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.ExperienceRecord.create.mockResolvedValue(mockExperience);

      const result = await service.addExperience('user-1', {
        title: 'Software Developer',
        company: 'Tech Safari',
        startDate: '2022-07',
      });

      expect(result).toEqual(mockExperience);
    });

    it('should prevent unauthorized updating of experience', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.ExperienceRecord.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockExperience, profileId: 'other-profile' }),
      });

      await expect(
        service.updateExperience('user-1', 'exp-1', { title: 'Lead' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Skills assignment', () => {
    it('should assign a new skill to profile', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockSkillsService.findById.mockResolvedValue(mockSkill);

      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });
      mockPrismaService.client.orm.public.ProfileSkill.create.mockResolvedValue(mockProfileSkill);

      const result = await service.assignSkill('user-1', {
        skillId: 'skill-1',
        level: 'advanced',
        yearsOfExperience: 3,
      });

      expect(result.skillId).toBe('skill-1');
      expect(result.name).toBe('TypeScript');
      expect(result.level).toBe('advanced');
    });

    it('should throw BadRequestException if neither skillId nor skillName is given', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);

      await expect(service.assignSkill('user-1', {})).rejects.toThrow(BadRequestException);
    });

    it('should remove a skill assignment', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfileSkill),
        delete: vi.fn().mockResolvedValue({}),
      });

      const result = await service.removeSkill('user-1', 'skill-1');
      expect(result.success).toBe(true);
    });
  });
});
