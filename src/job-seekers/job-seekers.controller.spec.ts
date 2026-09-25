import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobSeekersController } from './job-seekers.controller.js';
import { JobSeekersService } from './job-seekers.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';

describe('JobSeekersController', () => {
  let controller: JobSeekersController;
  let service: JobSeekersService;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'seeker@example.com',
    name: 'Jane Doe',
    emailVerified: true,
    role: 'job_seeker',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    headline: 'Senior Full Stack Engineer',
    photoUrl: 'https://example.com/photo.jpg',
    bio: 'Software specialist',
    location: 'Addis Ababa, Ethiopia',
    phone: '+251911000000',
    cvUrl: 'https://example.com/cv.pdf',
    languages: ['English', 'Amharic'],
    education: [],
    experience: [],
    skills: [],
    user: {
      id: 'user-1',
      email: 'seeker@example.com',
      name: 'Jane Doe',
      role: 'job_seeker',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockJobSeekersService = {
    getFullProfileByUserId: vi.fn(),
    getFullProfileById: vi.fn(),
    upsertProfile: vi.fn(),
    searchTalent: vi.fn(),
    getEducationList: vi.fn(),
    addEducation: vi.fn(),
    updateEducation: vi.fn(),
    deleteEducation: vi.fn(),
    getExperienceList: vi.fn(),
    addExperience: vi.fn(),
    updateExperience: vi.fn(),
    deleteExperience: vi.fn(),
    getAssignedSkills: vi.fn(),
    assignSkill: vi.fn(),
    batchAssignSkills: vi.fn(),
    updateSkillAssignment: vi.fn(),
    removeSkill: vi.fn(),
    getPortfolioProjects: vi.fn(),
    getPortfolioByProfileId: vi.fn(),
    addPortfolioProject: vi.fn(),
    getPortfolioProjectById: vi.fn(),
    updatePortfolioProject: vi.fn(),
    deletePortfolioProject: vi.fn(),
    moderateTalentProfile: vi.fn(),
  };

  const mockAuthService = {
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobSeekersController],
      providers: [
        { provide: JobSeekersService, useValue: mockJobSeekersService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<JobSeekersController>(JobSeekersController);
    service = module.get<JobSeekersService>(JobSeekersService);
    vi.clearAllMocks();
  });

  describe('Profile Endpoints', () => {
    it('should get current user profile', async () => {
      mockJobSeekersService.getFullProfileByUserId.mockResolvedValue(mockProfile);

      const res = await controller.getMyProfile(mockUser);
      expect(res).toEqual(mockProfile);
      expect(mockJobSeekersService.getFullProfileByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should update current user profile', async () => {
      mockJobSeekersService.upsertProfile.mockResolvedValue({
        ...mockProfile,
        bio: 'Updated bio',
      });

      const res = await controller.updateMyProfile(mockUser, { bio: 'Updated bio' });
      expect(res.message).toBe('Profile updated successfully.');
      expect(res.profile.bio).toBe('Updated bio');
    });

    it('should get public profile by id for authenticated viewer', async () => {
      mockJobSeekersService.getFullProfileById.mockResolvedValue(mockProfile);

      const res = await controller.getProfileById('profile-1', mockUser);
      expect(res).toEqual(mockProfile);
      expect(mockJobSeekersService.getFullProfileById).toHaveBeenCalledWith('profile-1', mockUser);
    });

    it('should open public profile for anonymous visitor with protected contact info', async () => {
      const protectedProfile = {
        ...mockProfile,
        phone: null,
        cvUrl: null,
        user: { ...mockProfile.user, email: '***@***.***' },
      };
      mockJobSeekersService.getFullProfileById.mockResolvedValue(protectedProfile);

      const res = await controller.getProfileById('profile-1', undefined);
      expect(res.phone).toBeNull();
      expect(res.cvUrl).toBeNull();
      expect(res.user?.email).toBe('***@***.***');
      expect(mockJobSeekersService.getFullProfileById).toHaveBeenCalledWith('profile-1', undefined);
    });

    it('should open portfolio projects by profile id', async () => {
      const mockProjects = [{ id: 'proj-1', title: 'Fruitful Journey Web App' }];
      mockJobSeekersService.getPortfolioByProfileId.mockResolvedValue(mockProjects);

      const res = await controller.getPortfolioByProfileId('profile-1', undefined);
      expect(res.count).toBe(1);
      expect(res.projects).toEqual(mockProjects);
      expect(mockJobSeekersService.getPortfolioByProfileId).toHaveBeenCalledWith('profile-1', undefined);
    });

    it('should search talent directory', async () => {
      mockJobSeekersService.searchTalent.mockResolvedValue([mockProfile]);

      const res = await controller.searchTalent(mockUser, 'Full Stack', 'Addis Ababa', 'true', 10);
      expect(res.count).toBe(1);
      expect(res.jobSeekers).toEqual([mockProfile]);
    });

    it('should search talent directory with QueryTalentDto filters', async () => {
      mockJobSeekersService.searchTalent.mockResolvedValue([mockProfile]);

      const res = await controller.searchTalent(mockUser, {
        skills: 'TypeScript,React',
        location: 'Nairobi',
        education: 'Computer Science',
        experience: 'Full Stack',
        minExperienceYears: 3,
      } as any);

      expect(res.count).toBe(1);
      expect(mockJobSeekersService.searchTalent).toHaveBeenCalledWith(
        expect.objectContaining({
          skills: 'TypeScript,React',
          location: 'Nairobi',
          education: 'Computer Science',
          experience: 'Full Stack',
          minExperienceYears: 3,
          viewerRole: 'job_seeker',
        }),
      );
    });

    it('should discover talent through discovery alias', async () => {
      mockJobSeekersService.searchTalent.mockResolvedValue([mockProfile]);

      const res = await controller.discoverTalent(mockUser, {
        skills: 'Node.js',
      } as any);

      expect(res.count).toBe(1);
      expect(res.jobSeekers).toEqual([mockProfile]);
    });

    it('should moderate profile approval as admin', async () => {
      const adminUser: AuthUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        emailVerified: true,
        role: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const moderated = {
        ...mockProfile,
        approvalStatus: 'approved',
        approvedAt: new Date().toISOString(),
      };
      mockJobSeekersService.moderateTalentProfile.mockResolvedValue(moderated);

      const res = await controller.moderateProfileApproval(adminUser, 'profile-1', {
        approvalStatus: 'approved' as any,
        adminNotes: 'Profile meets quality guidelines',
      });

      expect(res.message).toBe('Profile status updated to approved.');
      expect(res.profile.approvalStatus).toBe('approved');
      expect(mockJobSeekersService.moderateTalentProfile).toHaveBeenCalledWith(
        'admin-1',
        'profile-1',
        {
          approvalStatus: 'approved',
          adminNotes: 'Profile meets quality guidelines',
        },
      );
    });
  });

  describe('Education Endpoints', () => {
    it('should add education record', async () => {
      const mockEdu = { id: 'edu-1', institution: 'AAU', degree: 'BSc' };
      mockJobSeekersService.addEducation.mockResolvedValue(mockEdu);

      const res = await controller.addEducation(mockUser, {
        institution: 'AAU',
        degree: 'BSc',
        startDate: '2020',
      });

      expect(res.message).toBe('Education record successfully added.');
      expect(res.record).toEqual(mockEdu);
    });

    it('should list education records', async () => {
      mockJobSeekersService.getEducationList.mockResolvedValue([{ id: 'edu-1' }]);

      const res = await controller.getEducationList(mockUser);
      expect(res.count).toBe(1);
    });

    it('should update education record', async () => {
      mockJobSeekersService.updateEducation.mockResolvedValue({ id: 'edu-1', degree: 'MSc' });

      const res = await controller.updateEducation(mockUser, 'edu-1', { degree: 'MSc' });
      expect(res.record.degree).toBe('MSc');
    });

    it('should delete education record', async () => {
      mockJobSeekersService.deleteEducation.mockResolvedValue({ success: true });

      const res = await controller.deleteEducation(mockUser, 'edu-1');
      expect(res.success).toBe(true);
    });
  });

  describe('Experience Endpoints', () => {
    it('should add experience record', async () => {
      const mockExp = { id: 'exp-1', title: 'Engineer', company: 'ABC' };
      mockJobSeekersService.addExperience.mockResolvedValue(mockExp);

      const res = await controller.addExperience(mockUser, {
        title: 'Engineer',
        company: 'ABC',
        startDate: '2022',
      });

      expect(res.message).toBe('Experience record successfully added.');
      expect(res.record).toEqual(mockExp);
    });

    it('should delete experience record', async () => {
      mockJobSeekersService.deleteExperience.mockResolvedValue({ success: true });

      const res = await controller.deleteExperience(mockUser, 'exp-1');
      expect(res.success).toBe(true);
    });
  });

  describe('Skills Endpoints', () => {
    it('should assign a skill', async () => {
      const mockAssign = { skillId: 'skill-1', name: 'TypeScript', level: 'expert' };
      mockJobSeekersService.assignSkill.mockResolvedValue(mockAssign);

      const res = await controller.assignSkill(mockUser, {
        skillId: 'skill-1',
        level: 'expert',
      });

      expect(res).toEqual(mockAssign);
    });

    it('should remove a skill', async () => {
      mockJobSeekersService.removeSkill.mockResolvedValue({ success: true });

      const res = await controller.removeSkill(mockUser, 'skill-1');
      expect(res.success).toBe(true);
    });
  });

  describe('Portfolio Endpoints', () => {
    it('should list portfolio projects', async () => {
      mockJobSeekersService.getPortfolioProjects.mockResolvedValue([{ id: 'proj-1', title: 'App' }]);

      const res = await controller.getPortfolioProjects(mockUser);
      expect(res.count).toBe(1);
    });

    it('should add portfolio project', async () => {
      mockJobSeekersService.addPortfolioProject.mockResolvedValue({ id: 'proj-1', title: 'App' });

      const res = await controller.addPortfolioProject(mockUser, { title: 'App' });
      expect(res.message).toBe('Portfolio project added successfully.');
      expect(res.project.title).toBe('App');
    });

    it('should delete portfolio project', async () => {
      mockJobSeekersService.deletePortfolioProject.mockResolvedValue({ success: true });

      const res = await controller.deletePortfolioProject(mockUser, 'proj-1');
      expect(res.success).toBe(true);
    });

    it('should get portfolio project by id with viewer context', async () => {
      mockJobSeekersService.getPortfolioProjectById.mockResolvedValue({ id: 'proj-1', title: 'App' });

      const res = await controller.getPortfolioProjectById('proj-1', mockUser);
      expect(res).toEqual({ id: 'proj-1', title: 'App' });
      expect(mockJobSeekersService.getPortfolioProjectById).toHaveBeenCalledWith('proj-1', mockUser);
    });
  });
});

