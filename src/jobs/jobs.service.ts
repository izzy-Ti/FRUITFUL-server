import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateJobDto, UpdateJobDto, QueryJobsDto } from './dto/index.js';
import type { AuthUser } from '../auth/auth.service.js';

export interface EmployerSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  location: string | null;
  industry: string | null;
  websiteUrl: string | null;
  verificationStatus: string;
}

export interface FullJob {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  category: string | null;
  employmentType: string;
  workplaceType: string;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  experienceLevel: string | null;
  skills: string[];
  status: string;
  publishedAt: string | null;
  closedAt: string | null;
  deadline: string | null;
  employer?: EmployerSummary | null;
  applicationCount?: number;
  hasApplied?: boolean;
  applicationId?: string | null;
  applicationStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to assemble a job with linked employer organization details.
   */
  private async assembleJob(job: any): Promise<FullJob> {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: job.employerId })
      .first();

    return {
      id: job.id,
      employerId: job.employerId,
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      category: job.category,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      experienceLevel: job.experienceLevel,
      skills: job.skills || [],
      status: job.status,
      publishedAt: job.publishedAt,
      closedAt: job.closedAt,
      deadline: job.deadline,
      employer: employer
        ? {
            id: employer.id,
            name: employer.name,
            logoUrl: employer.logoUrl,
            location: employer.location,
            industry: employer.industry,
            websiteUrl: employer.websiteUrl,
            verificationStatus: employer.verificationStatus,
          }
        : null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Employer: Create a new job listing.
   */
  async createJob(userId: string, dto: CreateJobDto): Promise<FullJob> {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    if (!employer) {
      throw new BadRequestException(
        'Please create an employer organization profile first before posting jobs.',
      );
    }

    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BadRequestException('Minimum salary cannot exceed maximum salary.');
    }

    const nowIso = new Date().toISOString();
    const isPublished = Boolean(dto.publishImmediately);
    const status = isPublished ? 'published' : 'draft';
    const publishedAt = isPublished ? nowIso : null;

    const job = await this.prisma.client.orm.public.Job.create({
      id: randomUUID(),
      employerId: employer.id,
      title: dto.title,
      description: dto.description,
      requirements: dto.requirements || null,
      responsibilities: dto.responsibilities || null,
      category: dto.category || null,
      employmentType: dto.employmentType || 'full_time',
      workplaceType: dto.workplaceType || 'on_site',
      location: dto.location || null,
      salaryMin: dto.salaryMin !== undefined ? dto.salaryMin : null,
      salaryMax: dto.salaryMax !== undefined ? dto.salaryMax : null,
      salaryCurrency: dto.salaryCurrency || 'USD',
      experienceLevel: dto.experienceLevel || null,
      skills: dto.skills || [],
      status,
      publishedAt,
      closedAt: null,
      deadline: dto.deadline || null,
    });

    this.logger.log(`Job "${job.title}" created (status: ${status}) by employer ${employer.id}.`);
    return this.assembleJob(job);
  }

  /**
   * Employer: Update an existing job.
   */
  async updateJob(
    userId: string,
    jobId: string,
    dto: UpdateJobDto,
    isAdmin = false,
  ): Promise<FullJob> {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== existing.employerId) {
        throw new ForbiddenException('You are not authorized to edit this job.');
      }
    }

    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BadRequestException('Minimum salary cannot exceed maximum salary.');
    }

    const nowIso = new Date().toISOString();
    let status = dto.status || existing.status;
    let publishedAt = existing.publishedAt;
    let closedAt = existing.closedAt;

    if (dto.status === 'published' && existing.status !== 'published') {
      publishedAt = nowIso;
      closedAt = null;
    } else if (dto.status === 'closed' && existing.status !== 'closed') {
      closedAt = nowIso;
    }

    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .update({
        title: dto.title ?? existing.title,
        description: dto.description ?? existing.description,
        requirements: dto.requirements !== undefined ? dto.requirements : existing.requirements,
        responsibilities: dto.responsibilities !== undefined ? dto.responsibilities : existing.responsibilities,
        category: dto.category !== undefined ? dto.category : existing.category,
        employmentType: dto.employmentType ?? existing.employmentType,
        workplaceType: dto.workplaceType ?? existing.workplaceType,
        location: dto.location !== undefined ? dto.location : existing.location,
        salaryMin: dto.salaryMin !== undefined ? dto.salaryMin : existing.salaryMin,
        salaryMax: dto.salaryMax !== undefined ? dto.salaryMax : existing.salaryMax,
        salaryCurrency: dto.salaryCurrency ?? existing.salaryCurrency,
        experienceLevel: dto.experienceLevel !== undefined ? dto.experienceLevel : existing.experienceLevel,
        skills: dto.skills !== undefined ? dto.skills : existing.skills,
        status,
        publishedAt,
        closedAt,
        deadline: dto.deadline !== undefined ? dto.deadline : existing.deadline,
      });

    const updated = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    return this.assembleJob(updated!);
  }

  /**
   * Employer: Publish a job.
   */
  async publishJob(userId: string, jobId: string, isAdmin = false): Promise<FullJob> {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== existing.employerId) {
        throw new ForbiddenException('You are not authorized to publish this job.');
      }
    }

    const nowIso = new Date().toISOString();
    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .update({
        status: 'published',
        publishedAt: nowIso,
        closedAt: null,
      });

    const updated = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    this.logger.log(`Job ${jobId} published.`);
    return this.assembleJob(updated!);
  }

  /**
   * Employer: Close a job.
   */
  async closeJob(userId: string, jobId: string, isAdmin = false): Promise<FullJob> {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== existing.employerId) {
        throw new ForbiddenException('You are not authorized to close this job.');
      }
    }

    const nowIso = new Date().toISOString();
    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .update({
        status: 'closed',
        closedAt: nowIso,
      });

    const updated = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    this.logger.log(`Job ${jobId} closed.`);
    return this.assembleJob(updated!);
  }

  /**
   * Employer: Delete a job.
   */
  async deleteJob(userId: string, jobId: string, isAdmin = false): Promise<{ message: string }> {
    const existing = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!existing) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    if (!isAdmin) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId })
        .first();

      if (!employer || employer.id !== existing.employerId) {
        throw new ForbiddenException('You are not authorized to delete this job.');
      }
    }

    await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .delete();

    this.logger.log(`Job ${jobId} deleted.`);
    return { message: 'Job deleted successfully.' };
  }

  /**
   * Employer: Get all jobs posted by the employer's organization.
   */
  async getMyJobs(userId: string, status?: string): Promise<FullJob[]> {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId })
      .first();

    if (!employer) {
      return [];
    }

    let collection = this.prisma.client.orm.public.Job
      .where({ employerId: employer.id });

    if (status && status !== 'all') {
      collection = collection.where((j) => j.status.eq(status));
    }

    const jobs = await collection
      .orderBy((j) => j.createdAt.desc())
      .all();

    return Promise.all(jobs.map((j) => this.assembleJob(j)));
  }

  /**
   * Public & Candidates: Browse and search published jobs.
   */
  async findPublicJobs(query: QueryJobsDto): Promise<{
    total: number;
    page: number;
    limit: number;
    jobs: FullJob[];
  }> {
    let collection = this.prisma.client.orm.public.Job;

    // Public search only surfaces published jobs
    collection = collection.where((j) => j.status.eq('published'));

    if (query.category) {
      collection = collection.where((j) => j.category.ilike(`%${query.category!.trim()}%`));
    }

    if (query.employmentType) {
      collection = collection.where((j) => j.employmentType.eq(query.employmentType!));
    }

    if (query.workplaceType) {
      collection = collection.where((j) => j.workplaceType.eq(query.workplaceType!));
    }

    if (query.location) {
      collection = collection.where((j) => j.location.ilike(`%${query.location!.trim()}%`));
    }

    if (query.experienceLevel) {
      collection = collection.where((j) => j.experienceLevel.eq(query.experienceLevel!));
    }

    if (query.employerId) {
      collection = collection.where((j) => j.employerId.eq(query.employerId!));
    }

    if (query.minSalary !== undefined) {
      collection = collection.where((j) =>
        j.salaryMax.gte(query.minSalary!) || j.salaryMin.gte(query.minSalary!),
      );
    }

    if (query.maxSalary !== undefined) {
      collection = collection.where((j) => j.salaryMin.lte(query.maxSalary!));
    }

    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((j) =>
        j.title.ilike(term) || j.description.ilike(term) || j.category.ilike(term),
      );
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const allMatching = await collection
      .orderBy((j) => j.createdAt.desc())
      .all();

    const paginated = allMatching.slice(skip, skip + limit);
    const jobs = await Promise.all(paginated.map((j) => this.assembleJob(j)));

    return {
      total: allMatching.length,
      page,
      limit,
      jobs,
    };
  }

  /**
   * Retrieve a single job by ID with product access rules.
   */
  async getJobById(jobId: string, currentUser?: AuthUser): Promise<FullJob> {
    const job = await this.prisma.client.orm.public.Job
      .where({ id: jobId })
      .first();

    if (!job) {
      throw new NotFoundException(`Job with ID "${jobId}" was not found.`);
    }

    // Published jobs are visible to everyone
    if (job.status === 'published') {
      const assembled = await this.assembleJob(job);
      if (currentUser?.role === 'job_seeker') {
        const profile = await this.prisma.client.orm.public.JobSeekerProfile
          .where({ userId: currentUser.id })
          .first();

        if (profile) {
          const app = await this.prisma.client.orm.public.JobApplication
            .where({ jobId: job.id, profileId: profile.id })
            .first();

          if (app && app.status !== 'withdrawn') {
            assembled.hasApplied = true;
            assembled.applicationId = app.id;
            assembled.applicationStatus = app.status;
          } else {
            assembled.hasApplied = false;
          }
        }
      }

      if (currentUser?.role === 'admin' || currentUser?.role === 'employer') {
        const apps = await this.prisma.client.orm.public.JobApplication
          .where({ jobId: job.id })
          .all();
        assembled.applicationCount = apps.length;
      }

      return assembled;
    }

    // Non-published jobs (draft, closed, archived) require authentication
    if (!currentUser) {
      throw new ForbiddenException('This job is not currently publicly available.');
    }

    // Admins can view any job
    if (currentUser.role === 'admin') {
      const assembled = await this.assembleJob(job);
      const apps = await this.prisma.client.orm.public.JobApplication
        .where({ jobId: job.id })
        .all();
      assembled.applicationCount = apps.length;
      return assembled;
    }

    // Employer who owns the job can view it
    if (currentUser.role === 'employer') {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId: currentUser.id })
        .first();

      if (employer && employer.id === job.employerId) {
        const assembled = await this.assembleJob(job);
        const apps = await this.prisma.client.orm.public.JobApplication
          .where({ jobId: job.id })
          .all();
        assembled.applicationCount = apps.length;
        return assembled;
      }
    }

    throw new ForbiddenException('This job is not currently publicly available.');
  }

  /**
   * Admin: List all jobs across employers with status filtering.
   */
  async findAllAdmin(query: QueryJobsDto): Promise<{
    total: number;
    jobs: FullJob[];
  }> {
    let collection = this.prisma.client.orm.public.Job;

    if (query.status) {
      collection = collection.where((j) => j.status.eq(query.status!));
    }

    if (query.employerId) {
      collection = collection.where((j) => j.employerId.eq(query.employerId!));
    }

    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      collection = collection.where((j) =>
        j.title.ilike(term) || j.description.ilike(term),
      );
    }

    const limit = query.limit || 50;
    const jobs = await collection
      .orderBy((j) => j.createdAt.desc())
      .limit(limit)
      .all();

    const assembled = await Promise.all(jobs.map((j) => this.assembleJob(j)));
    return {
      total: assembled.length,
      jobs: assembled,
    };
  }
}
