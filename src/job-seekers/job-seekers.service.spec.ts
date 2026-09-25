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
    visibility: 'public',
    isAvailable: true,
    approvalStatus: 'approved',
    approvedAt: new Date().toISOString(),
    adminNotes: null,
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
          PortfolioProject: {
            where: vi.fn(),
            create: vi.fn(),
            all: vi.fn(),
            orderBy: vi.fn(),
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

      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue([]),
        }),
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

  describe('Portfolio operations', () => {
    const mockProject = {
      id: 'proj-1',
      profileId: 'profile-1',
      title: 'E-commerce Store',
      description: 'Built with NestJS and React',
      category: 'Web Development',
      projectUrl: 'https://store.example.com',
      repoUrl: 'https://github.com/example/store',
      images: ['https://example.com/img1.jpg'],
      documents: [],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should add portfolio project', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.PortfolioProject.create.mockResolvedValue(mockProject);

      const res = await service.addPortfolioProject('user-1', {
        title: 'E-commerce Store',
        category: 'Web Development',
      });

      expect(res.title).toBe('E-commerce Store');
      expect(res.category).toBe('Web Development');
    });

    it('should get portfolio project by id', async () => {
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProject),
      });

      const res = await service.getPortfolioProjectById('proj-1');
      expect(res).toEqual(mockProject);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(service.getPortfolioProjectById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete portfolio project with ownership verification', async () => {
      vi.spyOn(service, 'getOrCreateProfileRecord').mockResolvedValue(mockProfile as any);
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProject),
        delete: vi.fn().mockResolvedValue({}),
      });

      const res = await service.deletePortfolioProject('user-1', 'proj-1');
      expect(res.success).toBe(true);
    });
  });

  describe('Controlled Profile Visibility rules', () => {
    it('should reject non-owner access when profile is private', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'private' }),
      });

      await expect(
        service.getFullProfileById('profile-1', { id: 'other-user', role: 'job_seeker' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-employer access when profile is employers_only', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'employers_only' }),
      });

      await expect(
        service.getFullProfileById('profile-1', { id: 'other-user', role: 'job_seeker' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow employer access when profile is employers_only', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'employers_only' }),
      });

      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      mockPrismaService.client.orm.public.EducationRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });
      mockPrismaService.client.orm.public.ExperienceRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });
      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });

      const res = await service.getFullProfileById('profile-1', { id: 'emp-user', role: 'employer' });
      expect(res.id).toBe('profile-1');
      expect(res.phone).toBe(mockProfile.phone);
      expect(res.cvUrl).toBe(mockProfile.cvUrl);
    });

    it('should mask phone, email, and CV URL for anonymous/public visitors', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'public' }),
      });

      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });

      mockPrismaService.client.orm.public.EducationRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });
      mockPrismaService.client.orm.public.ExperienceRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });
      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([]),
      });
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });

      const res = await service.getFullProfileById('profile-1', undefined);
      expect(res.phone).toBeNull();
      expect(res.cvUrl).toBeNull();
      expect(res.user?.email).toBe('***@***.***');
    });

    it('should reject third-party access when profile is pending approval', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, approvalStatus: 'pending' }),
      });

      await expect(
        service.getFullProfileById('profile-1', { id: 'emp-1', role: 'employer' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should open portfolio projects for public profile', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'public' }),
      });
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([{ id: 'proj-1', title: 'Work' }]) }),
      });

      const res = await service.getPortfolioByProfileId('profile-1', undefined);
      expect(res).toHaveLength(1);
      expect(res[0].title).toBe('Work');
    });

    it('should enforce parent profile visibility on getPortfolioProjectById', async () => {
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 'proj-1', profileId: 'profile-1', title: 'Private Work' }),
      });
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ ...mockProfile, visibility: 'private' }),
      });

      await expect(
        service.getPortfolioProjectById('proj-1', { id: 'other-user', role: 'job_seeker' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Talent Discovery (searchTalent)', () => {
    let mockQueryChain: any;

    beforeEach(() => {
      mockQueryChain = {
        where: vi.fn().mockImplementation(() => mockQueryChain),
        all: vi.fn().mockResolvedValue([mockProfile]),
      };
      mockPrismaService.client.orm.public.JobSeekerProfile.where = mockQueryChain.where;
      mockPrismaService.client.orm.public.JobSeekerProfile.all = mockQueryChain.all;

      mockPrismaService.client.orm.public.User.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockUser),
      });
      mockPrismaService.client.orm.public.EducationRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([mockEducation]) }),
      });
      mockPrismaService.client.orm.public.ExperienceRecord.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([mockExperience]) }),
      });
      mockPrismaService.client.orm.public.ProfileSkill.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([mockProfileSkill]),
      });
      mockPrismaService.client.orm.public.Skill.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockSkill),
      });
      mockPrismaService.client.orm.public.PortfolioProject.where.mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
      });
    });

    it('should search approved talent profiles by default', async () => {
      const results = await service.searchTalent({
        viewerRole: 'employer',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('profile-1');
      expect(results[0].approvalStatus).toBe('approved');
      expect(results[0].phone).toBe(mockProfile.phone);
    });

    it('should filter candidate profiles by skills', async () => {
      const match = await service.searchTalent({
        skills: 'TypeScript',
        viewerRole: 'employer',
      });
      expect(match).toHaveLength(1);

      const noMatch = await service.searchTalent({
        skills: 'Rust,Go',
        viewerRole: 'employer',
      });
      expect(noMatch).toHaveLength(0);
    });

    it('should filter candidate profiles by location', async () => {
      const match = await service.searchTalent({
        location: 'Nairobi',
        viewerRole: 'employer',
      });
      expect(match).toHaveLength(1);
    });

    it('should filter candidate profiles by education', async () => {
      const matchDegree = await service.searchTalent({
        education: 'Computer Science',
        viewerRole: 'employer',
      });
      expect(matchDegree).toHaveLength(1);

      const matchInst = await service.searchTalent({
        institution: 'University of Nairobi',
        viewerRole: 'employer',
      });
      expect(matchInst).toHaveLength(1);

      const noMatch = await service.searchTalent({
        education: 'Medicine',
        viewerRole: 'employer',
      });
      expect(noMatch).toHaveLength(0);
    });

    it('should filter candidate profiles by experience and minimum years', async () => {
      const matchExp = await service.searchTalent({
        experience: 'Software Developer',
        viewerRole: 'employer',
      });
      expect(matchExp).toHaveLength(1);

      const matchYears = await service.searchTalent({
        minExperienceYears: 2,
        viewerRole: 'employer',
      });
      expect(matchYears).toHaveLength(1);

      const highYears = await service.searchTalent({
        minExperienceYears: 15,
        viewerRole: 'employer',
      });
      expect(highYears).toHaveLength(0);
    });

    it('should protect contact information for anonymous/job seeker viewers', async () => {
      const results = await service.searchTalent({
        viewerRole: 'job_seeker',
      });

      expect(results).toHaveLength(1);
      expect(results[0].phone).toBeNull();
      expect(results[0].user?.email).toBe('***@***.***');
    });
  });

  describe('Operational Moderation (moderateTalentProfile)', () => {
    it('should approve a talent profile and record approvedAt timestamp', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
        update: vi.fn().mockResolvedValue({
          ...mockProfile,
          approvalStatus: 'approved',
          approvedAt: new Date().toISOString(),
        }),
      });

      vi.spyOn(service, 'getFullProfileById').mockResolvedValue({
        ...mockProfile,
        approvalStatus: 'approved',
        approvedAt: new Date().toISOString(),
        adminNotes: 'Candidate verified',
        totalExperienceYears: 3,
        education: [],
        experience: [],
        skills: [],
        portfolioProjects: [],
      } as any);

      const res = await service.moderateTalentProfile('admin-1', 'profile-1', {
        approvalStatus: 'approved' as any,
        adminNotes: 'Candidate verified',
      });

      expect(res.approvalStatus).toBe('approved');
      expect(res.adminNotes).toBe('Candidate verified');
    });

    it('should reject a talent profile with admin notes', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(mockProfile),
        update: vi.fn().mockResolvedValue({
          ...mockProfile,
          approvalStatus: 'rejected',
        }),
      });

      vi.spyOn(service, 'getFullProfileById').mockResolvedValue({
        ...mockProfile,
        approvalStatus: 'rejected',
        adminNotes: 'Incomplete information',
        totalExperienceYears: 3,
        education: [],
        experience: [],
        skills: [],
        portfolioProjects: [],
      } as any);

      const res = await service.moderateTalentProfile('admin-1', 'profile-1', {
        approvalStatus: 'rejected' as any,
        adminNotes: 'Incomplete information',
      });

      expect(res.approvalStatus).toBe('rejected');
    });

    it('should throw NotFoundException if profile does not exist', async () => {
      mockPrismaService.client.orm.public.JobSeekerProfile.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.moderateTalentProfile('admin-1', 'non-existent', {
          approvalStatus: 'approved' as any,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

