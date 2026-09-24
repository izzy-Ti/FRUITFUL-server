import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { ApplicationsService } from '../src/applications/applications.service.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Job & Application Complete Lifecycle Workflow', () => {
  let jobsService: JobsService;
  let applicationsService: ApplicationsService;

  // In-memory data store to simulate end-to-end database operations
  let db: {
    users: any[];
    employerProfiles: any[];
    jobSeekerProfiles: any[];
    jobs: any[];
    applications: any[];
    statusHistories: any[];
    skills: any[];
  };

  function buildJobQuery(items: any[]): any {
    return {
      where: (filter: any) => {
        let filtered = [...items];
        if (typeof filter === 'function') {
          filtered = filtered.filter((j) => {
            const fakeField = (val: any) => ({
              eq: (target: any) => val === target,
              ilike: (target: string) =>
                String(val || '')
                  .toLowerCase()
                  .includes(target.replace(/%/g, '').toLowerCase()),
              gte: (target: number) => (val !== null && val !== undefined ? val >= target : false),
              lte: (target: number) => (val !== null && val !== undefined ? val <= target : false),
            });
            const res = filter({
              status: fakeField(j.status),
              category: fakeField(j.category),
              employmentType: fakeField(j.employmentType),
              workplaceType: fakeField(j.workplaceType),
              location: fakeField(j.location),
              experienceLevel: fakeField(j.experienceLevel),
              employerId: fakeField(j.employerId),
              title: fakeField(j.title),
              description: fakeField(j.description),
              salaryMin: fakeField(j.salaryMin),
              salaryMax: fakeField(j.salaryMax),
            });
            return Boolean(res);
          });
        } else if (filter && typeof filter === 'object') {
          if (filter.id) filtered = filtered.filter((j) => j.id === filter.id);
          if (filter.employerId) filtered = filtered.filter((j) => j.employerId === filter.employerId);
        }
        return buildJobQuery(filtered);
      },
      first: async () => items[0] || null,
      all: async () => items,
      orderBy: () => ({
        all: async () => items,
      }),
      update: async (patch: any) => {
        for (const item of items) {
          Object.assign(item, patch);
        }
      },
    };
  }

  function buildApplicationQuery(items: any[]): any {
    return {
      where: (filter: any) => {
        let filtered = [...items];
        if (typeof filter === 'function') {
          filtered = filtered.filter((a) => {
            const fakeField = (val: any) => ({
              eq: (target: any) => val === target,
            });
            return Boolean(filter({ status: fakeField(a.status) }));
          });
        } else if (filter && typeof filter === 'object') {
          if (filter.id) filtered = filtered.filter((a) => a.id === filter.id);
          if (filter.jobId) filtered = filtered.filter((a) => a.jobId === filter.jobId);
          if (filter.profileId) filtered = filtered.filter((a) => a.profileId === filter.profileId);
        }
        return buildApplicationQuery(filtered);
      },
      first: async () => items[0] || null,
      all: async () => items,
      orderBy: () => ({
        all: async () => items,
      }),
      update: async (patch: any) => {
        for (const item of items) {
          Object.assign(item, patch);
        }
      },
    };
  }

  beforeEach(async () => {
    // Initialize in-memory mock database
    db = {
      users: [
        { id: 'user-emp-1', email: 'hr@techcorp.com', name: 'Tech Corp HR', role: 'employer' },
        { id: 'user-seeker-1', email: 'alex@dev.com', name: 'Alex Johnson', role: 'job_seeker' },
      ],
      employerProfiles: [
        {
          id: 'emp-1',
          userId: 'user-emp-1',
          name: 'Tech Corp',
          logoUrl: 'https://techcorp.com/logo.png',
          description: 'Leading software innovations',
          location: 'Nairobi, Kenya',
          industry: 'Technology',
          websiteUrl: 'https://techcorp.com',
          verificationStatus: 'verified', // Approved employer
          verifiedAt: new Date().toISOString(),
          rejectionReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      jobSeekerProfiles: [
        {
          id: 'seeker-prof-1',
          userId: 'user-seeker-1',
          headline: 'Senior Full Stack Engineer',
          bio: 'Passionate TypeScript & React engineer',
          location: 'Remote',
          cvUrl: 'https://cloud.storage/cv.pdf',
          languages: ['English', 'Swahili'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      jobs: [],
      applications: [],
      statusHistories: [],
      skills: [],
    };

    const mockPrismaService = {
      client: {
        orm: {
          public: {
            User: {
              where: (query: any) => ({
                first: async () => db.users.find((u) => u.id === query.id) || null,
              }),
            },
            EmployerProfile: {
              where: (query: any) => ({
                first: async () =>
                  db.employerProfiles.find(
                    (e) => (query.id && e.id === query.id) || (query.userId && e.userId === query.userId),
                  ) || null,
              }),
            },
            JobSeekerProfile: {
              where: (query: any) => ({
                first: async () =>
                  db.jobSeekerProfiles.find(
                    (p) => (query.id && p.id === query.id) || (query.userId && p.userId === query.userId),
                  ) || null,
              }),
            },
            Job: {
              where: (filter: any) => buildJobQuery(db.jobs).where(filter),
              orderBy: () => ({
                all: async () => db.jobs,
              }),
              create: async (data: any) => {
                const now = new Date().toISOString();
                const record = {
                  ...data,
                  createdAt: now,
                  updatedAt: now,
                };
                db.jobs.push(record);
                return record;
              },
            },
            JobApplication: {
              where: (filter: any) => buildApplicationQuery(db.applications).where(filter),
              create: async (data: any) => {
                const now = new Date().toISOString();
                const record = {
                  ...data,
                  createdAt: now,
                  updatedAt: now,
                };
                db.applications.push(record);
                return record;
              },
            },
            ApplicationStatusHistory: {
              where: (filter: any) => {
                const matching = db.statusHistories.filter(
                  (h) => !filter.applicationId || h.applicationId === filter.applicationId,
                );
                return {
                  all: async () => matching,
                  orderBy: () => ({
                    all: async () =>
                      [...matching].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                      ),
                  }),
                };
              },
              create: async (data: any) => {
                const record = {
                  ...data,
                  createdAt: new Date(Date.now() + db.statusHistories.length * 1000).toISOString(),
                };
                db.statusHistories.push(record);
                return record;
              },
            },
            EducationRecord: {
              where: () => ({
                orderBy: () => ({ all: async () => [] }),
              }),
            },
            ExperienceRecord: {
              where: () => ({
                orderBy: () => ({ all: async () => [] }),
              }),
            },
            ProfileSkill: {
              where: () => ({
                all: async () => [],
              }),
            },
            PortfolioProject: {
              where: () => ({
                orderBy: () => ({ all: async () => [] }),
              }),
            },
          },
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    jobsService = module.get<JobsService>(JobsService);
    applicationsService = module.get<ApplicationsService>(ApplicationsService);
  });

  it('executes complete end-to-end user story across all acceptance criteria', async () => {
    // -------------------------------------------------------------
    // 1. An approved employer publishes a vacancy
    // -------------------------------------------------------------
    const createdDraft = await jobsService.createJob('user-emp-1', {
      title: 'Senior Full Stack Engineer',
      description: 'Looking for a senior developer with NestJS & React experience.',
      requirements: '5+ years experience in full-stack web applications',
      category: 'Software Engineering',
      employmentType: 'full_time',
      workplaceType: 'remote',
      location: 'Nairobi / Remote',
      salaryMin: 70000,
      salaryMax: 100000,
      salaryCurrency: 'USD',
      skills: ['TypeScript', 'NestJS', 'React', 'PostgreSQL'],
      publishImmediately: false,
    });

    expect(createdDraft.status).toBe('draft');
    expect(createdDraft.employer?.verificationStatus).toBe('verified');

    // Employer publishes the vacancy
    const publishedJob = await jobsService.publishJob('user-emp-1', createdDraft.id);
    expect(publishedJob.status).toBe('published');
    expect(publishedJob.publishedAt).toBeDefined();

    // -------------------------------------------------------------
    // 2. A candidate searches and applies
    // -------------------------------------------------------------
    // Candidate searches published jobs
    const searchResults = await jobsService.findPublicJobs({
      search: 'Full Stack',
      workplaceType: 'remote',
    });
    expect(searchResults.total).toBe(1);
    expect(searchResults.jobs[0].id).toBe(publishedJob.id);

    // Candidate inspects job details
    const candidateView = await jobsService.getJobById(publishedJob.id, {
      id: 'user-seeker-1',
      role: 'job_seeker',
    } as any);
    expect(candidateView.hasApplied).toBe(false);

    // Candidate submits application
    const applied = await applicationsService.applyToJob('user-seeker-1', {
      jobId: publishedJob.id,
      coverLetter: 'I am excited to apply for this Senior Full Stack Engineer role.',
      portfolioLinks: ['https://github.com/alexjohnson', 'https://alex.dev'],
    });

    expect(applied.status).toBe('submitted');
    expect(applied.jobId).toBe(publishedJob.id);

    // Candidate checks job detail again: hasApplied is now true
    const candidateViewAfterApply = await jobsService.getJobById(publishedJob.id, {
      id: 'user-seeker-1',
      role: 'job_seeker',
    } as any);
    expect(candidateViewAfterApply.hasApplied).toBe(true);
    expect(candidateViewAfterApply.applicationStatus).toBe('submitted');

    // -------------------------------------------------------------
    // 3. The employer reviews and updates applicants
    // -------------------------------------------------------------
    // Employer views dashboard
    const applicantDashboard = await applicationsService.getEmployerDashboard('user-emp-1');
    expect(applicantDashboard.metrics.totalApplicants).toBe(1);
    expect(applicantDashboard.metrics.newApplicants).toBe(1);

    // Employer reviews applicants for this specific job
    const jobApplicants = await applicationsService.getApplicantsForJob('user-emp-1', publishedJob.id);
    expect(jobApplicants.count).toBe(1);
    expect(jobApplicants.applications[0].candidate?.name).toBe('Alex Johnson');

    // Employer shortlists candidate with feedback notes
    const shortlisted = await applicationsService.shortlistCandidate(
      'user-emp-1',
      applied.id,
      'Impressive open-source portfolio and full-stack background.',
    );
    expect(shortlisted.status).toBe('shortlisted');
    expect(shortlisted.employerNotes).toBe('Impressive open-source portfolio and full-stack background.');

    // Employer schedules interview
    const interviewing = await applicationsService.updateApplicationStatus('user-emp-1', applied.id, {
      status: 'interview_scheduled',
      employerNotes: 'Technical interview scheduled for Friday at 2:00 PM.',
    });
    expect(interviewing.status).toBe('interview_scheduled');

    // Employer moves to hired
    const hired = await applicationsService.updateApplicationStatus('user-emp-1', applied.id, {
      status: 'hired',
      employerNotes: 'Offer accepted! Welcome to Tech Corp.',
    });
    expect(hired.status).toBe('hired');

    // -------------------------------------------------------------
    // 4. The candidate sees current application stage & audit history
    // -------------------------------------------------------------
    // Candidate inspects their application detail
    const candidateApp = await applicationsService.getApplicationById('user-seeker-1', applied.id, 'job_seeker');
    expect(candidateApp.status).toBe('hired');
    expect(candidateApp.employerNotes).toBe('Offer accepted! Welcome to Tech Corp.');

    // Candidate views candidate dashboard
    const candidateDashboard = await applicationsService.getCandidateDashboard('user-seeker-1');
    expect(candidateDashboard.metrics.totalApplied).toBe(1);
    expect(candidateDashboard.metrics.hired).toBe(1);
    expect(candidateDashboard.recentApplications[0].status).toBe('hired');

    // Candidate checks full application status history (most recent first)
    const history = await applicationsService.getApplicationHistory('user-seeker-1', applied.id, 'job_seeker');
    expect(history.length).toBeGreaterThanOrEqual(4);

    const receivedStatuses = history.map((h) => h.newStatus);
    expect(receivedStatuses).toEqual([
      'hired',
      'interview_scheduled',
      'shortlisted',
      'submitted',
    ]);
  });
});
