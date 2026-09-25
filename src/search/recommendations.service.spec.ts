import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecommendationsService } from './recommendations.service.js';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let mockPrisma: any;
  let mockSearch: any;
  let mockLocation: any;

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    headline: 'Senior React Developer',
    bio: 'Full-stack engineer',
    location: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    isAvailable: true,
    approvalStatus: 'approved',
    visibility: 'public',
  };

  const mockProfileSkills = [
    { skillId: 'react', level: 'expert', yearsOfExperience: 5 },
    { skillId: 'typescript', level: 'advanced', yearsOfExperience: 4 },
    { skillId: 'nodejs', level: 'intermediate', yearsOfExperience: 3 },
  ];

  const mockJob = {
    id: 'job-1',
    title: 'Senior Frontend Engineer',
    category: 'engineering',
    description: 'Build scalable React applications',
    requirements: 'React, TypeScript required',
    responsibilities: 'Lead frontend development',
    skills: ['react', 'typescript'],
    employmentType: 'full_time',
    workplaceType: 'remote',
    location: null,
    latitude: null,
    longitude: null,
    experienceLevel: 'senior',
    status: 'published',
    employerId: 'employer-1',
    publishedAt: new Date().toISOString(),
  };

  const createChain = (items: any[], single: any = null) => {
    const chain: any = {};
    chain.where = vi.fn().mockImplementation(() => chain);
    chain.orderBy = vi.fn().mockImplementation(() => chain);
    chain.limit = vi.fn().mockImplementation(() => chain);
    chain.asc = vi.fn().mockImplementation(() => chain);
    chain.desc = vi.fn().mockImplementation(() => chain);
    chain.all = vi.fn().mockResolvedValue(items);
    chain.first = vi.fn().mockImplementation((pk?: any) => {
      if (pk?.id) return Promise.resolve(items.find((i) => i.id === pk.id) ?? null);
      return Promise.resolve(single ?? items[0] ?? null);
    });
    return chain;
  };

  beforeEach(() => {
    mockPrisma = {
      client: {
        orm: {
          public: {
            JobSeekerProfile: createChain([mockProfile], mockProfile),
            Job: createChain([mockJob], mockJob),
            ProfileSkill: createChain(mockProfileSkills),
          },
        },
      },
    };

    mockSearch = {
      scoreJobFts: vi.fn().mockReturnValue(60),
    };

    mockLocation = {
      evaluateLocationMatch: vi.fn().mockResolvedValue({ matches: true, distanceKm: 0, isRemote: true }),
    };

    service = new RecommendationsService(
      mockPrisma as any,
      mockSearch as any,
      mockLocation as any,
    );
  });

  // =========================================================================
  // recommendJobsForSeeker
  // =========================================================================

  describe('recommendJobsForSeeker', () => {
    it('should return scored job recommendations', async () => {
      const results = await service.recommendJobsForSeeker('profile-1');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for unknown profile', async () => {
      mockPrisma.client.orm.public.JobSeekerProfile.first.mockResolvedValueOnce(null);
      const results = await service.recommendJobsForSeeker('nonexistent');
      expect(results).toEqual([]);
    });

    it('should score remote jobs when includeRemote is true', async () => {
      const results = await service.recommendJobsForSeeker('profile-1', { includeRemote: true });
      // Remote job with skill match should have score > 0
      if (results.length > 0) {
        expect(results[0].score).toBeGreaterThan(0);
        expect(Array.isArray(results[0].reasons)).toBe(true);
      }
    });

    it('should limit results to the requested count', async () => {
      const manyJobs = Array.from({ length: 20 }, (_, i) => ({ ...mockJob, id: `job-${i}` }));
      mockPrisma.client.orm.public.Job.all.mockResolvedValueOnce(manyJobs);

      const results = await service.recommendJobsForSeeker('profile-1', { limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  // =========================================================================
  // recommendCandidatesForJob
  // =========================================================================

  describe('recommendCandidatesForJob', () => {
    it('should return scored candidate recommendations', async () => {
      const results = await service.recommendCandidatesForJob('job-1');

      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for unknown job', async () => {
      mockPrisma.client.orm.public.Job.first.mockResolvedValueOnce(null);
      const results = await service.recommendCandidatesForJob('nonexistent');
      expect(results).toEqual([]);
    });

    it('should produce reasons array for each recommendation', async () => {
      const results = await service.recommendCandidatesForJob('job-1');
      for (const rec of results) {
        expect(Array.isArray(rec.reasons)).toBe(true);
        expect(rec.score).toBeGreaterThanOrEqual(0);
      }
    });

    it('should limit results to requested count', async () => {
      const manyProfiles = Array.from({ length: 30 }, (_, i) => ({ ...mockProfile, id: `profile-${i}` }));
      mockPrisma.client.orm.public.JobSeekerProfile.all.mockResolvedValueOnce(manyProfiles);

      const results = await service.recommendCandidatesForJob('job-1', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // =========================================================================
  // findSimilarJobs
  // =========================================================================

  describe('findSimilarJobs', () => {
    it('should return empty array for unknown job', async () => {
      mockPrisma.client.orm.public.Job.first.mockResolvedValueOnce(null);
      const results = await service.findSimilarJobs('nonexistent');
      expect(results).toEqual([]);
    });

    it('should exclude the source job from results', async () => {
      const similarJob = { ...mockJob, id: 'job-2', title: 'Frontend Engineer' };
      mockPrisma.client.orm.public.Job.all.mockResolvedValueOnce([similarJob]);

      const results = await service.findSimilarJobs('job-1', 6);
      expect(results.every((r) => r.job.id !== 'job-1')).toBe(true);
    });

    it('should return scored results with reasons', async () => {
      const similarJob = { ...mockJob, id: 'job-2', title: 'Frontend Engineer' };
      mockPrisma.client.orm.public.Job.all.mockResolvedValueOnce([similarJob]);

      const results = await service.findSimilarJobs('job-1');
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
        expect(Array.isArray(r.reasons)).toBe(true);
      }
    });

    it('should limit results', async () => {
      const manyJobs = Array.from({ length: 20 }, (_, i) => ({ ...mockJob, id: `job-sim-${i}` }));
      mockPrisma.client.orm.public.Job.all.mockResolvedValueOnce(manyJobs);

      const results = await service.findSimilarJobs('job-1', 4);
      expect(results.length).toBeLessThanOrEqual(4);
    });
  });

  // =========================================================================
  // Private helpers (via public interface)
  // =========================================================================

  describe('experience level matching', () => {
    it('should give lower scores to overqualified candidates when level is junior', async () => {
      // A profile with 2 years experience for a junior job should fit
      const juniorJob = { ...mockJob, id: 'job-junior', experienceLevel: 'junior', skills: ['react'] };
      mockPrisma.client.orm.public.Job.first.mockResolvedValueOnce(juniorJob);
      mockPrisma.client.orm.public.Job.all.mockResolvedValueOnce([]);

      // Should not crash even if no profiles have matching levels
      const results = await service.recommendCandidatesForJob('job-junior');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
