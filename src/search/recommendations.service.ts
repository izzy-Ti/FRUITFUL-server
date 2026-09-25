import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import { SearchService } from '../search/search.service.js';
import { LocationService } from '../search/location.service.js';

// =========================================================================
// INTERFACES
// =========================================================================

export interface JobRecommendation {
  job: any;
  score: number;
  reasons: string[];
}

export interface CandidateRecommendation {
  profile: any;
  score: number;
  reasons: string[];
}

export interface RecommendQueryOptions {
  limit?: number;
  includeRemote?: boolean;
  radiusKm?: number;
}

// =========================================================================
// SCORING WEIGHTS
// =========================================================================

const W = {
  // Job ↔ Profile matching
  SKILL_MATCH: 40,        // per matching skill (normalised)
  SKILL_LEVEL_BONUS: 10,  // extra for expert/advanced match
  EXACT_CATEGORY: 15,     // job category == profile headline keywords
  LOCATION_SAME: 15,      // same city / within radius
  REMOTE_BONUS: 10,       // remote job + profile available
  EXP_LEVEL_MATCH: 10,    // experience level aligns
  AVAILABILITY: 5,        // profile is currently available
  SALARY_MATCH: 5,        // salary range overlap
  FTS_RANK_SCALE: 15,     // PostgreSQL FTS rank contribution (scaled)
} as const;

// =========================================================================
// SERVICE
// =========================================================================

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  private readonly searchService: SearchService;
  private readonly locationService: LocationService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() searchService?: SearchService,
    @Optional() locationService?: LocationService,
  ) {
    this.searchService = searchService ?? new SearchService(new ConfigService());
    this.locationService = locationService ?? new LocationService(new ConfigService());
  }

  // =========================================================================
  // JOB RECOMMENDATIONS FOR A JOB SEEKER
  // =========================================================================

  /**
   * Returns the top-N jobs most relevant to a job seeker's profile.
   * Scoring considers:
   *  - Skill overlap (weighted by proficiency level)
   *  - Location proximity / remote preference
   *  - Experience level alignment
   *  - Category / headline keyword match
   *  - Profile availability
   */
  async recommendJobsForSeeker(
    profileId: string,
    options: RecommendQueryOptions = {},
  ): Promise<JobRecommendation[]> {
    const { limit = 10, includeRemote = true, radiusKm = 100 } = options;

    // Load the full seeker profile
    const profile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: profileId })
      .first();
    if (!profile) return [];

    const profileSkills = await this.prisma.client.orm.public.ProfileSkill
      .where({ profileId })
      .all();

    const skillNames = profileSkills.map((ps) => (ps as any).skillId?.toLowerCase?.() ?? '');
    const skillLevels: Record<string, string> = {};
    for (const ps of profileSkills) {
      skillLevels[(ps as any).skillId ?? ''] = (ps as any).level ?? 'intermediate';
    }

    // Load published jobs
    const jobs = await this.prisma.client.orm.public.Job
      .where((j) => j.status.eq('published'))
      .orderBy((j) => j.publishedAt.desc())
      .limit(200)
      .all();

    const scored: JobRecommendation[] = [];

    for (const job of jobs) {
      const reasons: string[] = [];
      let score = 0;

      // --- Skill overlap -----------------------------------------------
      const jobSkills: string[] = (job as any).skills ?? [];
      const matchedSkills = jobSkills.filter((js) =>
        skillNames.some(
          (ps) => ps && js.toLowerCase().includes(ps) || ps.includes(js.toLowerCase()),
        ),
      );
      if (jobSkills.length > 0 && matchedSkills.length > 0) {
        const ratio = matchedSkills.length / jobSkills.length;
        score += Math.round(W.SKILL_MATCH * ratio);
        reasons.push(`${matchedSkills.length}/${jobSkills.length} required skills matched`);

        // Proficiency bonus: expert/advanced on a matched skill
        for (const ms of matchedSkills) {
          const psId = Object.keys(skillLevels).find((id) =>
            id && ms.toLowerCase().includes(id.toLowerCase()),
          );
          if (psId) {
            const level = skillLevels[psId] ?? '';
            if (level === 'expert' || level === 'advanced') {
              score += W.SKILL_LEVEL_BONUS;
              reasons.push(`Expert/advanced level in ${ms}`);
              break; // one bonus per job
            }
          }
        }
      }

      // --- Category / headline match -----------------------------------
      const headline = (profile.headline ?? '').toLowerCase();
      const category = ((job as any).category ?? '').toLowerCase();
      if (category && headline.includes(category)) {
        score += W.EXACT_CATEGORY;
        reasons.push(`Job category "${(job as any).category}" matches your headline`);
      }

      // --- Experience level match --------------------------------------
      const expLevel = ((job as any).experienceLevel ?? '').toLowerCase();
      const totalExp = this.estimateTotalYears(profileSkills);
      const expMatch = this.experienceLevelFits(expLevel, totalExp);
      if (expMatch) {
        score += W.EXP_LEVEL_MATCH;
        reasons.push(`Experience level matches (${expLevel})`);
      }

      // --- Location / remote -------------------------------------------
      const isRemote =
        (job as any).workplaceType === 'remote' ||
        ((job as any).location ?? '').toLowerCase().includes('remote');

      if (isRemote && includeRemote) {
        score += W.REMOTE_BONUS;
        reasons.push('Remote position');
      } else if (!isRemote && profile.location && (job as any).location) {
        const match = await this.locationService.evaluateLocationMatch(
          { location: (job as any).location, latitude: (job as any).latitude, longitude: (job as any).longitude },
          { location: profile.location, latitude: profile.latitude ?? undefined, longitude: profile.longitude ?? undefined, radiusKm },
        );
        if (match.matches) {
          score += W.LOCATION_SAME;
          reasons.push(
            match.distanceKm !== undefined
              ? `Within ${match.distanceKm} km of your location`
              : 'Location matches',
          );
        }
      }

      // --- Availability ------------------------------------------------
      if (profile.isAvailable) {
        score += W.AVAILABILITY;
      }

      if (score > 0) {
        scored.push({ job, score, reasons });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // =========================================================================
  // CANDIDATE RECOMMENDATIONS FOR AN EMPLOYER'S JOB
  // =========================================================================

  /**
   * Returns the top-N candidates most relevant to a given job posting.
   * Considers:
   *  - Skill coverage vs job requirements
   *  - Skill proficiency levels
   *  - Location proximity / remote
   *  - Experience level alignment
   *  - Profile availability
   *  - FTS rank (in-memory weighted text score)
   */
  async recommendCandidatesForJob(
    jobId: string,
    options: RecommendQueryOptions = {},
  ): Promise<CandidateRecommendation[]> {
    const { limit = 10, includeRemote = true, radiusKm = 100 } = options;

    const job = await this.prisma.client.orm.public.Job.first({ id: jobId });
    if (!job) return [];

    const jobSkills: string[] = (job as any).skills ?? [];
    const jobTitle = (job as any).title ?? '';
    const jobDesc = [(job as any).description, (job as any).requirements].filter(Boolean).join(' ');

    // Approved, public profiles
    const profiles = await this.prisma.client.orm.public.JobSeekerProfile
      .where((p) => p.approvalStatus.eq('approved'))
      .where((p) => p.visibility.eq('public'))
      .limit(300)
      .all();

    const scored: CandidateRecommendation[] = [];

    for (const profile of profiles) {
      const reasons: string[] = [];
      let score = 0;

      // Load skills for this profile
      const pSkills = await this.prisma.client.orm.public.ProfileSkill
        .where({ profileId: profile.id })
        .all();

      const pSkillNames = pSkills.map((ps) => ((ps as any).skill?.name ?? (ps as any).skillId ?? '').toLowerCase());
      const pSkillLevels: Record<string, string> = {};
      for (const ps of pSkills) {
        const name = ((ps as any).skill?.name ?? (ps as any).skillId ?? '').toLowerCase();
        pSkillLevels[name] = (ps as any).level ?? 'intermediate';
      }

      // --- Skill coverage ----------------------------------------------
      if (jobSkills.length > 0) {
        const matched = jobSkills.filter((js) =>
          pSkillNames.some((ps) => ps && (ps.includes(js.toLowerCase()) || js.toLowerCase().includes(ps))),
        );
        if (matched.length > 0) {
          const ratio = matched.length / jobSkills.length;
          score += Math.round(W.SKILL_MATCH * ratio);
          reasons.push(`${matched.length}/${jobSkills.length} required skills covered`);

          // Expert/advanced bonus
          for (const ms of matched) {
            const levelKey = pSkillNames.find((n) => n && ms.toLowerCase().includes(n));
            if (levelKey) {
              const level = pSkillLevels[levelKey] ?? '';
              if (level === 'expert' || level === 'advanced') {
                score += W.SKILL_LEVEL_BONUS;
                reasons.push(`Expert/advanced in ${ms}`);
                break;
              }
            }
          }
        }
      }

      // --- Headline / keyword match ------------------------------------
      const textScore = this.searchService.scoreJobFts(
        { title: jobTitle, description: jobDesc, skills: jobSkills },
        profile.headline ?? '',
      );
      if (textScore > 0) {
        score += Math.round((textScore / 100) * W.FTS_RANK_SCALE);
        reasons.push('Headline matches job description');
      }

      // --- Experience level match -------------------------------------
      const expLevel = ((job as any).experienceLevel ?? '').toLowerCase();
      const totalExp = this.estimateTotalYears(pSkills);
      if (expLevel && this.experienceLevelFits(expLevel, totalExp)) {
        score += W.EXP_LEVEL_MATCH;
        reasons.push(`Experience level suits ${expLevel}`);
      }

      // --- Location / remote ------------------------------------------
      const isRemote = (job as any).workplaceType === 'remote';
      if (isRemote && includeRemote) {
        score += W.REMOTE_BONUS;
        reasons.push('Open to remote');
      } else if (!isRemote && (job as any).location && profile.location) {
        const match = await this.locationService.evaluateLocationMatch(
          { location: profile.location, latitude: profile.latitude ?? undefined, longitude: profile.longitude ?? undefined },
          { location: (job as any).location, latitude: (job as any).latitude ?? undefined, longitude: (job as any).longitude ?? undefined, radiusKm },
        );
        if (match.matches) {
          score += W.LOCATION_SAME;
          reasons.push(
            match.distanceKm !== undefined
              ? `Within ${match.distanceKm} km of job location`
              : 'Location matches',
          );
        }
      }

      // --- Availability -----------------------------------------------
      if (profile.isAvailable) {
        score += W.AVAILABILITY;
        reasons.push('Currently available');
      }

      if (score > 0) {
        scored.push({ profile, score, reasons });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // =========================================================================
  // SIMILAR JOBS (for a given job)
  // =========================================================================

  /**
   * Returns jobs similar to a given job — useful for "Related jobs" sections.
   * Similarity is based on skill overlap + category + location.
   */
  async findSimilarJobs(jobId: string, limit = 6): Promise<JobRecommendation[]> {
    const job = await this.prisma.client.orm.public.Job.first({ id: jobId });
    if (!job) return [];

    const jobSkills: string[] = (job as any).skills ?? [];
    const category = ((job as any).category ?? '').toLowerCase();

    const candidates = await this.prisma.client.orm.public.Job
      .where((j) => j.status.eq('published'))
      .where((j) => j.id.neq(jobId))
      .orderBy((j) => j.publishedAt.desc())
      .limit(100)
      .all();

    const scored: JobRecommendation[] = [];

    for (const cj of candidates) {
      const cSkills: string[] = (cj as any).skills ?? [];
      const reasons: string[] = [];
      let score = 0;

      // Skill overlap
      if (jobSkills.length > 0 && cSkills.length > 0) {
        const overlap = cSkills.filter((cs) => jobSkills.some((js) => js.toLowerCase() === cs.toLowerCase()));
        if (overlap.length > 0) {
          score += Math.round(W.SKILL_MATCH * (overlap.length / Math.max(jobSkills.length, cSkills.length)));
          reasons.push(`${overlap.length} shared skills`);
        }
      }

      // Category
      if (category && ((cj as any).category ?? '').toLowerCase() === category) {
        score += W.EXACT_CATEGORY;
        reasons.push('Same category');
      }

      // Experience level
      if ((job as any).experienceLevel && (job as any).experienceLevel === (cj as any).experienceLevel) {
        score += W.EXP_LEVEL_MATCH;
        reasons.push('Same experience level');
      }

      if (score > 0) {
        scored.push({ job: cj, score, reasons });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private estimateTotalYears(skills: any[]): number {
    if (!skills.length) return 0;
    return Math.max(...skills.map((s) => Number((s as any).yearsOfExperience) || 0), 0);
  }

  private experienceLevelFits(level: string, years: number): boolean {
    switch (level) {
      case 'entry':
      case 'junior':       return years <= 3;
      case 'mid':
      case 'mid_level':    return years >= 2 && years <= 7;
      case 'senior':       return years >= 4;
      case 'lead':
      case 'principal':    return years >= 6;
      case 'executive':    return years >= 8;
      default:             return true; // unknown level — don't penalise
    }
  }
}
