import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

export interface SkillMatchDetail {
  name: string;
  level: string; // 'beginner' | 'intermediate' | 'advanced' | 'expert'
  yearsOfExperience: number;
  weightMultiplier: number;
  proficiencyScore: number;
  matchedQueryTerm: string;
  isPrimary?: boolean;
}

export interface ProfileSearchScoreBreakdown {
  compositeScore: number; // 0 - 100
  textRank: number; // 0 - 100
  skillScore: number; // 0 - 100
  skillMatchPercentage: number; // 0 - 100
  matchedSkills: SkillMatchDetail[];
  missingSkills: string[];
}

export interface SearchTalentCriteria {
  search?: string;
  skills?: string | string[];
  minSkillLevel?: string;
  minExperienceYears?: number;
}

@Injectable()
export class SearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchService.name);
  private pool: any = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    try {
      const databaseUrl = this.configService.get<string>('database.url');
      if (databaseUrl && process.env.NODE_ENV !== 'test') {
        const { Pool } = pg as any;
        this.pool = new Pool({
          connectionString: databaseUrl,
          max: 5,
          idleTimeoutMillis: 30000,
        });
        this.logger.log('PostgreSQL Full-Text Search pool initialized.');
      }
    } catch (err) {
      this.logger.warn('Failed to initialize PostgreSQL direct pool for search:', err);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (err) {
        this.logger.warn('Error closing search pool:', err);
      }
    }
  }

  // =========================================================================
  // POSTGRESQL NATIVE FULL-TEXT SEARCH EXECUTORS
  // =========================================================================

  /**
   * Cleans and sanitizes natural language search queries for PostgreSQL websearch_to_tsquery.
   */
  sanitizeWebSearchQuery(input: string): string {
    if (!input) return '';
    let sanitized = input.trim();

    // Ensure double quotes are properly paired
    const quoteCount = (sanitized.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      sanitized = sanitized.replace(/"/g, ' ');
    }

    // Strip characters that break tsquery syntax while retaining quotes, hyphen (negation), and letters/numbers
    sanitized = sanitized.replace(/[^\w\s"'-]/g, ' ').replace(/\s+/g, ' ').trim();
    return sanitized;
  }

  /**
   * Executes native PostgreSQL Full-Text Search against published Jobs using GIN index.
   * Returns matching job IDs ranked by cover density (ts_rank_cd) with {0.1, 0.2, 0.4, 1.0} weights.
   */
  async executeJobsFts(
    searchQuery: string,
    limit: number = 50,
  ): Promise<{ id: string; rank: number }[]> {
    const cleanQuery = this.sanitizeWebSearchQuery(searchQuery);
    if (!cleanQuery || !this.pool) {
      return [];
    }

    try {
      const sql = `
        SELECT 
          j.id,
          ts_rank_cd(
            '{0.1, 0.2, 0.4, 1.0}',
            (
              setweight(to_tsvector('english'::regconfig, coalesce(j.title, '')), 'A') ||
              setweight(to_tsvector('english'::regconfig, coalesce(j.category, '')), 'B') ||
              setweight(to_tsvector('english'::regconfig, coalesce(j.description, '') || ' ' || coalesce(j.requirements, '') || ' ' || coalesce(j.responsibilities, '')), 'C') ||
              setweight(to_tsvector('english'::regconfig, coalesce(j.location, '')), 'D')
            ),
            websearch_to_tsquery('english'::regconfig, $1),
            32
          ) AS rank
        FROM "job" j
        WHERE j.status = 'published'
          AND (
            setweight(to_tsvector('english'::regconfig, coalesce(j.title, '')), 'A') ||
            setweight(to_tsvector('english'::regconfig, coalesce(j.category, '')), 'B') ||
            setweight(to_tsvector('english'::regconfig, coalesce(j.description, '') || ' ' || coalesce(j.requirements, '') || ' ' || coalesce(j.responsibilities, '')), 'C') ||
            setweight(to_tsvector('english'::regconfig, coalesce(j.location, '')), 'D')
          ) @@ websearch_to_tsquery('english'::regconfig, $1)
        ORDER BY rank DESC
        LIMIT $2;
      `;

      const result = await this.pool.query(sql, [cleanQuery, limit]);
      return result.rows.map((r: any) => ({
        id: r.id,
        rank: Math.min(Math.round(parseFloat(r.rank || '0') * 100), 100),
      }));
    } catch (error) {
      this.logger.warn(`Jobs FTS query failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  /**
   * Executes native PostgreSQL Full-Text Search against approved Talent Profiles using GIN index.
   * Returns matching profile IDs ranked by cover density (ts_rank_cd) with {0.1, 0.2, 0.4, 1.0} weights.
   */
  async executeTalentFts(
    searchQuery: string,
    limit: number = 50,
  ): Promise<{ id: string; rank: number }[]> {
    const cleanQuery = this.sanitizeWebSearchQuery(searchQuery);
    if (!cleanQuery || !this.pool) {
      return [];
    }

    try {
      const sql = `
        SELECT 
          p.id,
          ts_rank_cd(
            '{0.1, 0.2, 0.4, 1.0}',
            (
              setweight(to_tsvector('english'::regconfig, coalesce(p.headline, '') || ' ' || coalesce(u.name, '')), 'A') ||
              setweight(to_tsvector('english'::regconfig, coalesce(p.bio, '')), 'C') ||
              setweight(to_tsvector('english'::regconfig, coalesce(p.location, '')), 'D')
            ),
            websearch_to_tsquery('english'::regconfig, $1),
            32
          ) AS rank
        FROM "jobSeekerProfile" p
        LEFT JOIN "user" u ON u.id = p."userId"
        WHERE p."approvalStatus" = 'approved'
          AND (
            setweight(to_tsvector('english'::regconfig, coalesce(p.headline, '') || ' ' || coalesce(u.name, '')), 'A') ||
            setweight(to_tsvector('english'::regconfig, coalesce(p.bio, '')), 'C') ||
            setweight(to_tsvector('english'::regconfig, coalesce(p.location, '')), 'D')
          ) @@ websearch_to_tsquery('english'::regconfig, $1)
        ORDER BY rank DESC
        LIMIT $2;
      `;

      const result = await this.pool.query(sql, [cleanQuery, limit]);
      return result.rows.map((r: any) => ({
        id: r.id,
        rank: Math.min(Math.round(parseFloat(r.rank || '0') * 100), 100),
      }));
    } catch (error) {
      this.logger.warn(`Talent FTS query failed: ${error instanceof Error ? error.message : error}`);
      return [];
    }
  }

  // =========================================================================
  // WEIGHTED SKILL & PROFILE SCORING ENGINE
  // =========================================================================

  /**
   * Multi-dimensional weighted skill & profile ranking algorithm.
   * Considers:
   * - PostgreSQL Full-Text Weights (A: 1.0, B: 0.4, C: 0.2, D: 0.1)
   * - Proficiency levels (Expert 1.5x, Advanced 1.25x, Intermediate 1.0x, Beginner 0.7x)
   * - Skill tenure bonus (+5% per year, max +50%)
   * - Primary/Anchor skill flag (+25% boost)
   * - Skill coverage ratio vs skill depth
   * - Quoted phrases and negation in search query
   */
  scoreTalentProfile(
    profile: any,
    criteria: SearchTalentCriteria,
  ): ProfileSearchScoreBreakdown {
    const { search, skills, minSkillLevel } = criteria;

    let textRank = 0;
    let skillScore = 0;
    let skillMatchPercentage = 0;
    const matchedSkills: SkillMatchDetail[] = [];
    const missingSkills: string[] = [];

    // Parse target skills
    const targetSkillList: string[] = [];
    if (skills) {
      if (Array.isArray(skills)) {
        targetSkillList.push(...skills.map((s) => s.trim().toLowerCase()).filter(Boolean));
      } else if (typeof skills === 'string') {
        targetSkillList.push(
          ...skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        );
      }
    }

    // 1. EVALUATE WEIGHTED SKILLS
    if (targetSkillList.length > 0) {
      const profileSkills: any[] = profile.skills || [];
      const levelHierarchy: Record<string, number> = {
        beginner: 1,
        intermediate: 2,
        advanced: 3,
        expert: 4,
      };
      const minLevelRank = minSkillLevel ? (levelHierarchy[minSkillLevel.toLowerCase()] || 0) : 0;

      for (const target of targetSkillList) {
        // Find best matching skill in profile
        const matched = profileSkills.find((ps) => {
          const sName = (ps.name || '').toLowerCase();
          const sCat = (ps.category || '').toLowerCase();
          return sName === target || sName.includes(target) || target.includes(sName) || sCat.includes(target);
        });

        if (matched) {
          const level = (matched.level || 'intermediate').toLowerCase();
          const levelRank = levelHierarchy[level] || 2;

          // If minSkillLevel filter is required and profile doesn't meet it, treat as partial or disqualify
          if (minLevelRank > 0 && levelRank < minLevelRank) {
            missingSkills.push(target);
            continue;
          }

          const levelMultipliers: Record<string, number> = {
            expert: 1.5,
            advanced: 1.25,
            intermediate: 1.0,
            beginner: 0.7,
          };
          const weightMultiplier = levelMultipliers[level] || 1.0;

          const years = matched.yearsOfExperience || 0;
          const tenureBonus = Math.min(years * 0.05, 0.5); // Up to +50% tenure boost
          const primaryMultiplier = matched.isPrimary ? 1.25 : 1.0;

          // Proficiency score (0 - 100 scale for this single skill)
          const singleSkillScore = Math.min(
            Math.round(((weightMultiplier / 1.5) * 80 + (tenureBonus / 0.5) * 20) * primaryMultiplier),
            100,
          );

          matchedSkills.push({
            name: matched.name,
            level,
            yearsOfExperience: years,
            weightMultiplier,
            proficiencyScore: singleSkillScore,
            matchedQueryTerm: target,
            isPrimary: Boolean(matched.isPrimary),
          });
        } else {
          missingSkills.push(target);
        }
      }

      skillMatchPercentage = Math.round((matchedSkills.length / targetSkillList.length) * 100);

      if (matchedSkills.length > 0) {
        const avgProficiencyScore =
          matchedSkills.reduce((acc, curr) => acc + curr.proficiencyScore, 0) / matchedSkills.length;
        // Scale the average proficiency of matched skills by the coverage percentage
        skillScore = Math.round(avgProficiencyScore * (skillMatchPercentage / 100));
      } else {
        skillScore = 0;
      }
    }

    // 2. EVALUATE WEIGHTED TEXT SEARCH
    if (search && search.trim()) {
      textRank = this.calculateWeightedTextRank(profile, search.trim());
    }

    // 3. COMPUTE COMPOSITE SCORE
    let compositeScore = 0;
    if (targetSkillList.length > 0 && search && search.trim()) {
      // Both skill search and text search are active
      compositeScore = Math.round(0.55 * skillScore + 0.45 * textRank);
    } else if (targetSkillList.length > 0) {
      compositeScore = skillScore;
    } else if (search && search.trim()) {
      compositeScore = textRank;
    }

    return {
      compositeScore,
      textRank,
      skillScore,
      skillMatchPercentage,
      matchedSkills,
      missingSkills,
    };
  }

  /**
   * In-memory PostgreSQL weighted full-text ranking simulation:
   * Weight A (1.0): Headline, Name, Primary Skills
   * Weight B (0.4): Secondary Skills, Job Titles (Experience), Degrees (Education)
   * Weight C (0.2): Bio, Experience Companies, Experience Descriptions, Fields of Study
   * Weight D (0.1): Location, Institutions, Portfolio Descriptions
   */
  private calculateWeightedTextRank(profile: any, rawQuery: string): number {
    const parsed = this.parseQueryTokens(rawQuery);
    if (parsed.positiveTerms.length === 0 && parsed.phrases.length === 0) {
      return 0;
    }

    // Check negation (e.g. -junior): if profile contains excluded term in headline or title, penalize heavily
    for (const neg of parsed.negativeTerms) {
      const headline = (profile.headline || '').toLowerCase();
      const expTitles = (profile.experience || []).map((e: any) => (e.title || '').toLowerCase()).join(' ');
      if (headline.includes(neg) || expTitles.includes(neg)) {
        return 0; // Excluded candidate
      }
    }

    // Assemble weighted text fields
    const weightA = [
      profile.headline || '',
      profile.user?.name || '',
      ...(profile.skills || []).filter((s: any) => s.isPrimary).map((s: any) => s.name || ''),
    ].join(' ').toLowerCase();

    const weightB = [
      ...(profile.skills || []).filter((s: any) => !s.isPrimary).map((s: any) => s.name || ''),
      ...(profile.experience || []).map((e: any) => e.title || ''),
      ...(profile.education || []).map((e: any) => e.degree || ''),
    ].join(' ').toLowerCase();

    const weightC = [
      profile.bio || '',
      ...(profile.experience || []).map((e: any) => `${e.company || ''} ${e.description || ''}`),
      ...(profile.education || []).map((e: any) => e.fieldOfStudy || ''),
    ].join(' ').toLowerCase();

    const weightD = [
      profile.location || '',
      ...(profile.education || []).map((e: any) => e.institution || ''),
      ...(profile.portfolio || []).map((p: any) => `${p.title || ''} ${p.description || ''}`),
    ].join(' ').toLowerCase();

    let totalScore = 0;
    const allSearchUnits = [...parsed.phrases, ...parsed.positiveTerms];

    for (const unit of allSearchUnits) {
      let unitScore = 0;
      // Weight A: 1.0 (multiplier: 50 points max)
      if (weightA.includes(unit)) unitScore += 50 * 1.0;
      // Weight B: 0.4 (multiplier: 50 * 0.4 = 20 points max)
      if (weightB.includes(unit)) unitScore += 50 * 0.4;
      // Weight C: 0.2 (multiplier: 50 * 0.2 = 10 points max)
      if (weightC.includes(unit)) unitScore += 50 * 0.2;
      // Weight D: 0.1 (multiplier: 50 * 0.1 = 5 points max)
      if (weightD.includes(unit)) unitScore += 50 * 0.1;

      totalScore += unitScore;
    }

    // Normalized against number of search terms, mapped to 0-100
    const normalized = Math.min(Math.round(totalScore / allSearchUnits.length), 100);
    return normalized;
  }

  /**
   * Weighted scoring for Job listings.
   * Weight A (1.0): title
   * Weight B (0.4): skills, category
   * Weight C (0.2): description, requirements, responsibilities
   * Weight D (0.1): location, workplaceType, employmentType
   */
  scoreJobFts(job: any, rawQuery: string): number {
    const parsed = this.parseQueryTokens(rawQuery);
    if (parsed.positiveTerms.length === 0 && parsed.phrases.length === 0) {
      return 0;
    }

    // Negation check
    for (const neg of parsed.negativeTerms) {
      const title = (job.title || '').toLowerCase();
      if (title.includes(neg)) return 0;
    }

    const weightA = (job.title || '').toLowerCase();
    const weightB = [
      ...(job.skills || []),
      job.category || '',
    ].join(' ').toLowerCase();
    const weightC = [
      job.description || '',
      job.requirements || '',
      job.responsibilities || '',
    ].join(' ').toLowerCase();
    const weightD = [
      job.location || '',
      job.workplaceType || '',
      job.employmentType || '',
    ].join(' ').toLowerCase();

    let totalScore = 0;
    const allSearchUnits = [...parsed.phrases, ...parsed.positiveTerms];

    for (const unit of allSearchUnits) {
      let unitScore = 0;
      if (weightA.includes(unit)) unitScore += 50 * 1.0;
      if (weightB.includes(unit)) unitScore += 50 * 0.4;
      if (weightC.includes(unit)) unitScore += 50 * 0.2;
      if (weightD.includes(unit)) unitScore += 50 * 0.1;
      totalScore += unitScore;
    }

    return Math.min(Math.round(totalScore / allSearchUnits.length), 100);
  }

  /**
   * Helper to parse query into phrases ("exact phrase"), negative terms (-term), and positive terms.
   */
  private parseQueryTokens(query: string): {
    phrases: string[];
    negativeTerms: string[];
    positiveTerms: string[];
  } {
    const phrases: string[] = [];
    const negativeTerms: string[] = [];
    const positiveTerms: string[] = [];

    // Extract quoted phrases
    let remaining = query.toLowerCase();
    const phraseRegex = /"([^"]+)"/g;
    let match;
    while ((match = phraseRegex.exec(remaining)) !== null) {
      if (match[1].trim()) {
        phrases.push(match[1].trim());
      }
    }
    remaining = remaining.replace(phraseRegex, ' ');

    // Extract terms
    const tokens = remaining.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token.startsWith('-') && token.length > 1) {
        negativeTerms.push(token.substring(1));
      } else if (token.length > 1) {
        positiveTerms.push(token);
      }
    }

    return { phrases, negativeTerms, positiveTerms };
  }
}
