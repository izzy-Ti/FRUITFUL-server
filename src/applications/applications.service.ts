import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import {
  ApplyJobDto,
  UpdateApplicationStatusDto,
  QueryApplicationsDto,
} from './dto/index.js';

export interface ApplicationJobSummary {
  id: string;
  title: string;
  category: string | null;
  employmentType: string;
  workplaceType: string;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employer: {
    id: string;
    name: string;
    logoUrl: string | null;
    location: string | null;
    verificationStatus: string;
  } | null;
}

export interface CandidateProfileSummary {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  headline: string | null;
  photoUrl: string | null;
  bio: string | null;
  location: string | null;
  phone: string | null;
  cvUrl: string | null;
  languages: string[] | readonly string[];
  education?: any[];
  experience?: any[];
  skills?: any[];
  portfolioProjects?: any[];
}

export interface FullApplication {
  id: string;
  jobId: string;
  profileId: string;
  status: string;
  coverLetter: string | null;
  cvUrl: string | null;
  portfolioLinks: string[] | readonly string[];
  employerNotes: string | null;
  appliedAt: string;
  updatedAt: string;
  job?: ApplicationJobSummary | null;
  candidate?: CandidateProfileSummary | null;
}

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to assemble an application with job, employer, and optionally full candidate details.
   */
  private async assembleApplication(
    app: any,
    includeProfile = false,
  ): Promise<FullApplication> {
    const job = await this.prisma.client.orm.public.Job
      .where({ id: app.jobId })
      .first();

    let jobSummary: ApplicationJobSummary | null = null;
    if (job) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ id: job.employerId })
        .first();

      jobSummary = {
        id: job.id,
        title: job.title,
        category: job.category,
        employmentType: job.employmentType,
        workplaceType: job.workplaceType,
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        employer: employer
          ? {
              id: employer.id,
              name: employer.name,
              logoUrl: employer.logoUrl,
              location: employer.location,
              verificationStatus: employer.verificationStatus,
            }
          : null,
      };
    }

    let candidateSummary: CandidateProfileSummary | null = null;
    if (includeProfile) {
      const profile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: app.profileId })
        .first();

      if (profile) {
        const user = await this.prisma.client.orm.public.User
          .where({ id: profile.userId })
          .first();

        const [education, experience, profileSkills, portfolioProjects] = await Promise.all([
          this.prisma.client.orm.public.EducationRecord
            .where({ profileId: profile.id })
            .orderBy((e) => e.startDate.desc())
            .all(),
          this.prisma.client.orm.public.ExperienceRecord
            .where({ profileId: profile.id })
            .orderBy((e) => e.startDate.desc())
            .all(),
          this.prisma.client.orm.public.ProfileSkill
            .where({ profileId: profile.id })
            .all(),
          this.prisma.client.orm.public.PortfolioProject
            .where({ profileId: profile.id })
            .orderBy((p) => p.createdAt.desc())
            .all(),
        ]);

        const populatedSkills = await Promise.all(
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
            };
          }),
        );

        candidateSummary = {
          id: profile.id,
          userId: profile.userId,
          name: user?.name || null,
          email: user?.email || '',
          headline: profile.headline,
          photoUrl: profile.photoUrl,
          bio: profile.bio,
          location: profile.location,
          phone: profile.phone,
          cvUrl: profile.cvUrl,
          languages: profile.languages || [],
          education,
          experience,
          skills: populatedSkills,
          portfolioProjects,
        };
      }
    }

    return {
      id: app.id,
      jobId: app.jobId,
      profileId: app.profileId,
      status: app.status,
      coverLetter: app.coverLetter,
      cvUrl: app.cvUrl,
      portfolioLinks: app.portfolioLinks || [],
      employerNotes: app.employerNotes,
      appliedAt: app.appliedAt,
      updatedAt: app.updatedAt,
      job: jobSummary,
      candidate: candidateSummary,
    };
  }

  /**
   * Candidate: Apply to a job listing.
   */
  async applyToJob(userId: string, dto: ApplyJobDto): Promise<FullApplication> {
    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId })
      .first();

    if (!profile) {
      throw new BadRequestException(
        'Please create your job seeker profile first before applying to jobs.',
      );
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: dto.jobId })
      .first();

    if (!job) {
      throw new NotFoundException(`Job with ID "${dto.jobId}" was not found.`);
    }

    if (job.status !== 'published') {
      throw new BadRequestException('Applications are only accepted for published jobs.');
    }

    if (job.deadline) {
      const deadlineDate = new Date(job.deadline);
      if (!isNaN(deadlineDate.getTime()) && deadlineDate < new Date()) {
        throw new BadRequestException('The application deadline for this job has passed.');
      }
    }

    const existing = await this.prisma.client.orm.public.JobApplication
      .where({ jobId: dto.jobId, profileId: profile.id })
      .first();

    const nowIso = new Date().toISOString();
    const cvUrl = dto.cvUrl || profile.cvUrl || null;

    if (existing) {
      if (existing.status !== 'withdrawn') {
        throw new BadRequestException('You have already submitted an application for this job.');
      }

      // Re-apply if previously withdrawn
      await this.prisma.client.orm.public.JobApplication
        .where({ id: existing.id })
        .update({
          status: 'submitted',
          coverLetter: dto.coverLetter !== undefined ? dto.coverLetter : existing.coverLetter,
          cvUrl: cvUrl || existing.cvUrl,
          portfolioLinks: dto.portfolioLinks || existing.portfolioLinks,
          appliedAt: nowIso,
        });

      const updated = await this.prisma.client.orm.public.JobApplication
        .where({ id: existing.id })
        .first();

      this.logger.log(`Job seeker ${userId} re-submitted application for job ${dto.jobId}.`);
      return this.assembleApplication(updated!);
    }

    const application = await this.prisma.client.orm.public.JobApplication.create({
      id: randomUUID(),
      jobId: dto.jobId,
      profileId: profile.id,
      status: 'submitted',
      coverLetter: dto.coverLetter || null,
      cvUrl,
      portfolioLinks: dto.portfolioLinks || [],
      employerNotes: null,
      appliedAt: nowIso,
    });

    this.logger.log(`Job seeker ${userId} submitted application for job ${dto.jobId}.`);
    return this.assembleApplication(application);
  }

  /**
   * Candidate: Withdraw an application.
   */
  async withdrawApplication(
    userId: string,
    applicationId: string,
  ): Promise<{ message: string; application: FullApplication }> {
    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application with ID "${applicationId}" was not found.`);
    }

    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId })
      .first();

    if (!profile || profile.id !== application.profileId) {
      throw new ForbiddenException('You can only withdraw your own applications.');
    }

    if (application.status === 'withdrawn') {
      const assembled = await this.assembleApplication(application);
      return {
        message: 'Application has already been withdrawn.',
        application: assembled,
      };
    }

    if (application.status === 'hired') {
      throw new BadRequestException('Cannot withdraw an application that has already been accepted/hired.');
    }

    await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .update({
        status: 'withdrawn',
      });

    const updated = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    this.logger.log(`Application ${applicationId} withdrawn by candidate ${userId}.`);
    const assembled = await this.assembleApplication(updated!);

    return {
      message: 'Application withdrawn successfully.',
      application: assembled,
    };
  }

  /**
   * Candidate: List all applications submitted by the logged-in job seeker.
   */
  async getMyApplications(userId: string, status?: string): Promise<FullApplication[]> {
    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId })
      .first();

    if (!profile) {
      return [];
    }

    let collection = this.prisma.client.orm.public.JobApplication
      .where({ profileId: profile.id });

    if (status && status !== 'all') {
      collection = collection.where((a) => a.status.eq(status));
    }

    const applications = await collection
      .orderBy((a) => a.appliedAt.desc())
      .all();

    return Promise.all(applications.map((app) => this.assembleApplication(app)));
  }

  /**
   * Employer: View all applicants for a specific job.
   */
  async getApplicantsForJob(
    userId: string,
    jobId: string,
    query?: QueryApplicationsDto,
    isAdmin = false,
  ): Promise<{
    count: number;
    jobTitle: string;
    applications: FullApplication[];
  }> {
    const job = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!job) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== job.employerId) {
        throw new ForbiddenException('You are not authorized to view applicants for this job.');
      }
    }

    let collection = this.prisma.client.orm.public.JobApplication
      .where({ jobId });

    if (query?.status && query.status !== 'all') {
      collection = collection.where((a) => a.status.eq(query.status!));
    }

    const applications = await collection
      .orderBy((a) => a.appliedAt.desc())
      .all();

    const assembled = await Promise.all(
      applications.map((app) => this.assembleApplication(app, true)),
    );

    return {
      count: assembled.length,
      jobTitle: job.title,
      applications: assembled,
    };
  }

  /**
   * Employer: Update candidate application status (e.g. reviewed, shortlisted, rejected, hired).
   */
  async updateApplicationStatus(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
    isAdmin = false,
  ): Promise<FullApplication> {
    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application with ID "${applicationId}" was not found.`);
    }

    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job) {
      throw new NotFoundException('Associated job listing was not found.');
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== job.employerId) {
        throw new ForbiddenException('You are not authorized to update applications for this job.');
      }
    }

    await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .update({
        status: dto.status,
        employerNotes: dto.employerNotes !== undefined ? dto.employerNotes : application.employerNotes,
      });

    const updated = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    this.logger.log(`Application ${applicationId} status updated to "${dto.status}".`);
    return this.assembleApplication(updated!, true);
  }

  /**
   * View details of a specific application.
   */
  async getApplicationById(
    userId: string,
    applicationId: string,
    userRole: string,
  ): Promise<FullApplication> {
    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application with ID "${applicationId}" was not found.`);
    }

    if (userRole === 'admin') {
      return this.assembleApplication(application, true);
    }

    if (userRole === 'job_seeker') {
      const profile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId })
        .first();

      if (!profile || profile.id !== application.profileId) {
        throw new ForbiddenException('You are not authorized to view this application.');
      }

      return this.assembleApplication(application);
    }

    if (userRole === 'employer') {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      const job = await this.prisma.client.orm.public.Job
        .where({ id: application.jobId })
        .first();

      if (!employer || !job || employer.id !== job.employerId) {
        throw new ForbiddenException('You are not authorized to view this application.');
      }

      return this.assembleApplication(application, true);
    }

    throw new ForbiddenException('You are not authorized to view this application.');
  }
}
