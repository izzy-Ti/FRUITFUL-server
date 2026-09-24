import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { SkillsService } from '../skills/skills.service.js';
import { Role } from '../common/enums/role.enum.js';
import {
  UpsertProfileDto,
  CreateEducationDto,
  UpdateEducationDto,
  CreateExperienceDto,
  UpdateExperienceDto,
  AssignSkillDto,
  UpdateSkillAssignmentDto,
  CreatePortfolioProjectDto,
  UpdatePortfolioProjectDto,
} from './dto/index.js';

export interface FullJobSeekerProfile {
  id: string;
  userId: string;
  headline: string | null;
  photoUrl: string | null;
  bio: string | null;
  location: string | null;
  phone: string | null;
  cvUrl: string | null;
  languages: string[];
  visibility: string;
  isAvailable: boolean;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  } | null;
  education: any[];
  experience: any[];
  skills: any[];
  portfolioProjects: any[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class JobSeekersService {
  private readonly logger = new Logger(JobSeekersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillsService: SkillsService,
  ) {}

  /**
   * Internal helper to find or create a profile for a given user.
   */
  async getOrCreateProfileRecord(userId: string) {
    let profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId })
      .first();

    if (!profile) {
      profile = await this.prisma.client.orm.public.JobSeekerProfile.create({
        id: randomUUID(),
        userId,
        languages: [],
        visibility: 'public',
        isAvailable: true,
      });
      this.logger.log(`Created new JobSeekerProfile ${profile.id} for user ${userId}`);
    }

    return profile;
  }

  /**
   * Retrieve the complete profile for a user including education, experience, skills, and portfolio.
   */
  async getFullProfileByUserId(userId: string): Promise<FullJobSeekerProfile> {
    const profile = await this.getOrCreateProfileRecord(userId);
    return this.assembleFullProfile(profile);
  }

  /**
   * Retrieve a job seeker profile by ID with controlled visibility rules applied.
   */
  async getFullProfileById(
    profileId: string,
    viewer?: { id?: string; role?: string },
  ): Promise<FullJobSeekerProfile> {
    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: profileId })
      .first();

    if (!profile) {
      throw new NotFoundException(`Job seeker profile with ID "${profileId}" was not found.`);
    }

    const isOwner = viewer?.id && viewer.id === profile.userId;
    const isAdmin = viewer?.role === Role.ADMIN;
    const isEmployer = viewer?.role === Role.EMPLOYER;

    // Enforce controlled visibility rules
    if (!isOwner && !isAdmin) {
      if (profile.visibility === 'private') {
        throw new ForbiddenException('This job seeker profile is set to private.');
      }
      if (profile.visibility === 'employers_only' && !isEmployer) {
        throw new ForbiddenException(
          'This profile is restricted to verified employers only.',
        );
      }
    }

    const assembled = await this.assembleFullProfile(profile);

    // If viewer is anonymous or non-employer, protect contact details
    if (!isOwner && !isAdmin && !isEmployer) {
      assembled.phone = null;
      if (assembled.user) {
        assembled.user.email = '***@***.***';
      }
    }

    return assembled;
  }

  /**
   * Private helper to fetch related education, experience, skills, portfolio, and user info.
   */
  private async assembleFullProfile(profile: any): Promise<FullJobSeekerProfile> {
    // 1. Fetch user info
    const user = await this.prisma.client.orm.public.User
      .where({ id: profile.userId })
      .first();

    // 2. Fetch education records
    const education = await this.prisma.client.orm.public.EducationRecord
      .where({ profileId: profile.id })
      .orderBy((e) => e.startDate.desc())
      .all();

    // 3. Fetch experience records
    const experience = await this.prisma.client.orm.public.ExperienceRecord
      .where({ profileId: profile.id })
      .orderBy((e) => e.startDate.desc())
      .all();

    // 4. Fetch assigned skills with skill taxonomy metadata
    const profileSkills = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId: profile.id })
      .all();

    const skillsWithMeta = await Promise.all(
      profileSkills.map(async (ps) => {
        const skill = await this.prisma.client.orm.public.Skill
          .where({ id: ps.skillId })
          .first();

        return {
          id: ps.id,
          skillId: ps.skillId,
          name: skill?.name || 'Unknown',
          category: skill?.category || null,
          level: ps.level,
          yearsOfExperience: ps.yearsOfExperience,
          createdAt: ps.createdAt,
          updatedAt: ps.updatedAt,
        };
      }),
    );

    // 5. Fetch portfolio projects
    const portfolioProjects = await this.prisma.client.orm.public.PortfolioProject
      .where({ profileId: profile.id })
      .orderBy((p) => p.createdAt.desc())
      .all();

    return {
      id: profile.id,
      userId: profile.userId,
      headline: profile.headline,
      photoUrl: profile.photoUrl,
      bio: profile.bio,
      location: profile.location,
      phone: profile.phone,
      cvUrl: profile.cvUrl,
      languages: profile.languages || [],
      visibility: profile.visibility || 'public',
      isAvailable: profile.isAvailable ?? true,
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        : null,
      education,
      experience,
      skills: skillsWithMeta,
      portfolioProjects,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Update or create the profile metadata for the authenticated job seeker.
   */
  async upsertProfile(userId: string, dto: UpsertProfileDto): Promise<FullJobSeekerProfile> {
    const existing = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId })
      .first();

    if (existing) {
      await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: existing.id })
        .update({
          ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
          ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.cvUrl !== undefined ? { cvUrl: dto.cvUrl } : {}),
          ...(dto.languages !== undefined ? { languages: dto.languages } : {}),
          ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
          ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
        });
    } else {
      await this.prisma.client.orm.public.JobSeekerProfile.create({
        id: randomUUID(),
        userId,
        headline: dto.headline || null,
        photoUrl: dto.photoUrl || null,
        bio: dto.bio || null,
        location: dto.location || null,
        phone: dto.phone || null,
        cvUrl: dto.cvUrl || null,
        languages: dto.languages || [],
        visibility: dto.visibility || 'public',
        isAvailable: dto.isAvailable ?? true,
      });
    }

    return this.getFullProfileByUserId(userId);
  }

  /**
   * Search talent directory with role-aware privacy and filtering.
   */
  async searchTalent(query?: {
    search?: string;
    location?: string;
    isAvailable?: boolean;
    limit?: number;
    viewerRole?: string;
  }) {
    let collection = this.prisma.client.orm.public.JobSeekerProfile;

    // Apply visibility filter according to viewer role
    if (query?.viewerRole === Role.EMPLOYER || query?.viewerRole === Role.ADMIN) {
      collection = collection.where((p) => p.visibility.neq('private'));
    } else {
      collection = collection.where((p) => p.visibility.eq('public'));
    }

    if (query?.isAvailable !== undefined) {
      collection = collection.where((p) => p.isAvailable.eq(query.isAvailable!));
    }

    if (query?.location) {
      const locTerm = `%${query.location.trim().toLowerCase()}%`;
      collection = collection.where((p) => p.location.ilike(locTerm));
    }

    if (query?.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((p) =>
        p.headline.ilike(term) || p.bio.ilike(term)
      );
    }

    const limit = query?.limit || 20;
    const profiles = await collection.limit(limit).all();

    const isPrivileged =
      query?.viewerRole === Role.EMPLOYER || query?.viewerRole === Role.ADMIN;

    return Promise.all(
      profiles.map((p) =>
        this.assembleFullProfile(p).then((res) => {
          if (!isPrivileged) {
            res.phone = null;
            if (res.user) res.user.email = '***@***.***';
          }
          return res;
        }),
      ),
    );
  }

  // ==========================================
  // EDUCATION RECORDS
  // ==========================================

  async addEducation(userId: string, dto: CreateEducationDto) {
    const profile = await this.getOrCreateProfileRecord(userId);

    const record = await this.prisma.client.orm.public.EducationRecord.create({
      id: randomUUID(),
      profileId: profile.id,
      institution: dto.institution.trim(),
      degree: dto.degree.trim(),
      fieldOfStudy: dto.fieldOfStudy?.trim() || null,
      startDate: dto.startDate,
      endDate: dto.endDate || null,
      isCurrent: dto.isCurrent ?? false,
      description: dto.description?.trim() || null,
    });

    return record;
  }

  async getEducationList(userId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    return await this.prisma.client.orm.public.EducationRecord
      .where({ profileId: profile.id })
      .orderBy((e) => e.startDate.desc())
      .all();
  }

  async updateEducation(userId: string, educationId: string, dto: UpdateEducationDto) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.EducationRecord
      .where({ id: educationId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Education record with ID "${educationId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to modify this education record.');
    }

    const updated = await this.prisma.client.orm.public.EducationRecord
      .where({ id: educationId })
      .update({
        ...(dto.institution !== undefined ? { institution: dto.institution.trim() } : {}),
        ...(dto.degree !== undefined ? { degree: dto.degree.trim() } : {}),
        ...(dto.fieldOfStudy !== undefined ? { fieldOfStudy: dto.fieldOfStudy.trim() } : {}),
        ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
        ...(dto.isCurrent !== undefined ? { isCurrent: dto.isCurrent } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      });

    return updated || existing;
  }

  async deleteEducation(userId: string, educationId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.EducationRecord
      .where({ id: educationId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Education record with ID "${educationId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to delete this education record.');
    }

    await this.prisma.client.orm.public.EducationRecord
      .where({ id: educationId })
      .delete();

    return {
      success: true,
      message: 'Education record successfully deleted.',
    };
  }

  // ==========================================
  // EXPERIENCE RECORDS
  // ==========================================

  async addExperience(userId: string, dto: CreateExperienceDto) {
    const profile = await this.getOrCreateProfileRecord(userId);

    const record = await this.prisma.client.orm.public.ExperienceRecord.create({
      id: randomUUID(),
      profileId: profile.id,
      title: dto.title.trim(),
      company: dto.company.trim(),
      location: dto.location?.trim() || null,
      employmentType: dto.employmentType?.trim() || null,
      startDate: dto.startDate,
      endDate: dto.endDate || null,
      isCurrent: dto.isCurrent ?? false,
      description: dto.description?.trim() || null,
    });

    return record;
  }

  async getExperienceList(userId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    return await this.prisma.client.orm.public.ExperienceRecord
      .where({ profileId: profile.id })
      .orderBy((e) => e.startDate.desc())
      .all();
  }

  async updateExperience(userId: string, experienceId: string, dto: UpdateExperienceDto) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.ExperienceRecord
      .where({ id: experienceId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Experience record with ID "${experienceId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to modify this experience record.');
    }

    const updated = await this.prisma.client.orm.public.ExperienceRecord
      .where({ id: experienceId })
      .update({
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.company !== undefined ? { company: dto.company.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType.trim() } : {}),
        ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
        ...(dto.isCurrent !== undefined ? { isCurrent: dto.isCurrent } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      });

    return updated || existing;
  }

  async deleteExperience(userId: string, experienceId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.ExperienceRecord
      .where({ id: experienceId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Experience record with ID "${experienceId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to delete this experience record.');
    }

    await this.prisma.client.orm.public.ExperienceRecord
      .where({ id: experienceId })
      .delete();

    return {
      success: true,
      message: 'Experience record successfully deleted.',
    };
  }

  // ==========================================
  // SKILLS & SKILL ASSIGNMENT
  // ==========================================

  async assignSkill(userId: string, dto: AssignSkillDto) {
    const profile = await this.getOrCreateProfileRecord(userId);

    let skillId = dto.skillId;

    if (!skillId && dto.skillName) {
      const skill = await this.skillsService.findOrCreate(dto.skillName);
      skillId = skill.id;
    }

    if (!skillId) {
      throw new BadRequestException('Either skillId or skillName must be provided to assign a skill.');
    }

    // Verify skill exists
    const skill = await this.skillsService.findById(skillId);

    // Check if already assigned
    const existing = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId: profile.id, skillId })
      .first();

    if (existing) {
      // Update existing assignment
      const updated = await this.prisma.client.orm.public.ProfileSkill
        .where({ id: existing.id })
        .update({
          ...(dto.level !== undefined ? { level: dto.level } : {}),
          ...(dto.yearsOfExperience !== undefined ? { yearsOfExperience: dto.yearsOfExperience } : {}),
        });

      return {
        id: updated?.id || existing.id,
        skillId: skill.id,
        name: skill.name,
        category: skill.category,
        level: updated?.level ?? existing.level,
        yearsOfExperience: updated?.yearsOfExperience ?? existing.yearsOfExperience,
        message: 'Skill assignment updated.',
      };
    }

    // Create new assignment
    const created = await this.prisma.client.orm.public.ProfileSkill.create({
      id: randomUUID(),
      profileId: profile.id,
      skillId,
      level: dto.level || null,
      yearsOfExperience: dto.yearsOfExperience || null,
    });

    return {
      id: created.id,
      skillId: skill.id,
      name: skill.name,
      category: skill.category,
      level: created.level,
      yearsOfExperience: created.yearsOfExperience,
      message: 'Skill successfully assigned to profile.',
    };
  }

  async batchAssignSkills(userId: string, skills: AssignSkillDto[]) {
    const results = [];
    for (const item of skills) {
      const res = await this.assignSkill(userId, item);
      results.push(res);
    }
    return results;
  }

  async getAssignedSkills(userId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const assignments = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId: profile.id })
      .all();

    return Promise.all(
      assignments.map(async (ps) => {
        const skill = await this.prisma.client.orm.public.Skill
          .where({ id: ps.skillId })
          .first();

        return {
          id: ps.id,
          skillId: ps.skillId,
          name: skill?.name || 'Unknown',
          category: skill?.category || null,
          level: ps.level,
          yearsOfExperience: ps.yearsOfExperience,
          createdAt: ps.createdAt,
          updatedAt: ps.updatedAt,
        };
      }),
    );
  }

  async updateSkillAssignment(userId: string, skillId: string, dto: UpdateSkillAssignmentDto) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId: profile.id, skillId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Skill assignment for skill ID "${skillId}" was not found.`);
    }

    const updated = await this.prisma.client.orm.public.ProfileSkill
      .where({ id: existing.id })
      .update({
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.yearsOfExperience !== undefined ? { yearsOfExperience: dto.yearsOfExperience } : {}),
      });

    const skill = await this.skillsService.findById(skillId);

    return {
      id: updated?.id || existing.id,
      skillId,
      name: skill.name,
      category: skill.category,
      level: updated?.level ?? existing.level,
      yearsOfExperience: updated?.yearsOfExperience ?? existing.yearsOfExperience,
    };
  }

  async removeSkill(userId: string, skillId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId: profile.id, skillId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Skill assignment for skill ID "${skillId}" was not found.`);
    }

    await this.prisma.client.orm.public.ProfileSkill
      .where({ id: existing.id })
      .delete();

    return {
      success: true,
      message: 'Skill successfully removed from profile.',
    };
  }

  // ==========================================
  // PORTFOLIO PROJECTS
  // ==========================================

  async addPortfolioProject(userId: string, dto: CreatePortfolioProjectDto) {
    const profile = await this.getOrCreateProfileRecord(userId);

    const project = await this.prisma.client.orm.public.PortfolioProject.create({
      id: randomUUID(),
      profileId: profile.id,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      category: dto.category?.trim() || null,
      projectUrl: dto.projectUrl || null,
      repoUrl: dto.repoUrl || null,
      images: dto.images || [],
      documents: dto.documents || [],
      links: dto.links || [],
    });

    return project;
  }

  async getPortfolioProjects(userId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    return await this.prisma.client.orm.public.PortfolioProject
      .where({ profileId: profile.id })
      .orderBy((p) => p.createdAt.desc())
      .all();
  }

  async getPortfolioProjectById(projectId: string) {
    const project = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .first();

    if (!project) {
      throw new NotFoundException(`Portfolio project with ID "${projectId}" was not found.`);
    }

    return project;
  }

  async updatePortfolioProject(
    userId: string,
    projectId: string,
    dto: UpdatePortfolioProjectDto,
  ) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Portfolio project with ID "${projectId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to modify this portfolio project.');
    }

    const updated = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .update({
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.projectUrl !== undefined ? { projectUrl: dto.projectUrl } : {}),
        ...(dto.repoUrl !== undefined ? { repoUrl: dto.repoUrl } : {}),
        ...(dto.images !== undefined ? { images: dto.images } : {}),
        ...(dto.documents !== undefined ? { documents: dto.documents } : {}),
        ...(dto.links !== undefined ? { links: dto.links } : {}),
      });

    return updated || existing;
  }

  async deletePortfolioProject(userId: string, projectId: string) {
    const profile = await this.getOrCreateProfileRecord(userId);
    const existing = await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Portfolio project with ID "${projectId}" was not found.`);
    }

    if (existing.profileId !== profile.id) {
      throw new ForbiddenException('You do not have permission to delete this portfolio project.');
    }

    await this.prisma.client.orm.public.PortfolioProject
      .where({ id: projectId })
      .delete();

    return {
      success: true,
      message: 'Portfolio project successfully deleted.',
    };
  }
}
