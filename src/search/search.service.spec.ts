import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  let service: SearchService;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: (key: string) => {
        if (key === 'database.url') return 'postgresql://mock:mock@localhost:5432/mockdb';
        return null;
      },
    };
    service = new SearchService(mockConfigService as ConfigService);
  });

  describe('sanitizeWebSearchQuery', () => {
    it('should sanitize unclosed quotes and special characters', () => {
      expect(service.sanitizeWebSearchQuery('react "developer')).toBe('react developer');
      expect(service.sanitizeWebSearchQuery('react "developer" -junior')).toBe('react "developer" -junior');
      expect(service.sanitizeWebSearchQuery('hello @#$% world')).toBe('hello world');
      expect(service.sanitizeWebSearchQuery('')).toBe('');
    });
  });

  describe('Weighted Skill Scoring', () => {
    const mockProfile = {
      headline: 'Senior Full Stack Engineer',
      user: { name: 'Alice Smith' },
      bio: 'Experienced in developing distributed cloud systems',
      location: 'London, UK',
      skills: [
        { name: 'TypeScript', level: 'expert', yearsOfExperience: 6, isPrimary: true },
        { name: 'NestJS', level: 'advanced', yearsOfExperience: 4, isPrimary: true },
        { name: 'PostgreSQL', level: 'intermediate', yearsOfExperience: 3, isPrimary: false },
        { name: 'Docker', level: 'beginner', yearsOfExperience: 1, isPrimary: false },
      ],
      experience: [
        { title: 'Tech Lead', company: 'Acme Corp', description: 'Led cloud migration to AWS' },
      ],
      education: [
        { degree: 'BSc Computer Science', institution: 'Oxford', fieldOfStudy: 'Software Engineering' },
      ],
      portfolio: [
        { title: 'Fruitful Journey', description: 'Next-generation recruitment platform' },
      ],
    };

    it('should score matched skills with proficiency multipliers and tenure bonuses', () => {
      const result = service.scoreTalentProfile(mockProfile, {
        skills: 'TypeScript, NestJS',
      });

      expect(result.skillMatchPercentage).toBe(100);
      expect(result.matchedSkills).toHaveLength(2);
      expect(result.missingSkills).toHaveLength(0);
      expect(result.skillScore).toBeGreaterThan(70);

      // Verify expert skill scored higher than advanced
      const tsSkill = result.matchedSkills.find((s) => s.name === 'TypeScript');
      const nestSkill = result.matchedSkills.find((s) => s.name === 'NestJS');
      expect(tsSkill?.weightMultiplier).toBe(1.5);
      expect(nestSkill?.weightMultiplier).toBe(1.25);
    });

    it('should detect missing skills and adjust coverage ratio accordingly', () => {
      const result = service.scoreTalentProfile(mockProfile, {
        skills: 'TypeScript, Kubernetes, Go',
      });

      expect(result.matchedSkills).toHaveLength(1);
      expect(result.missingSkills).toEqual(['kubernetes', 'go']);
      expect(result.skillMatchPercentage).toBe(33); // 1 out of 3
      expect(result.skillScore).toBeLessThan(50);
    });

    it('should enforce minSkillLevel constraint', () => {
      // Docker is beginner (level 1)
      const withoutFilter = service.scoreTalentProfile(mockProfile, {
        skills: 'Docker',
      });
      expect(withoutFilter.matchedSkills).toHaveLength(1);

      // Filter requiring at least advanced (level 3)
      const withFilter = service.scoreTalentProfile(mockProfile, {
        skills: 'Docker',
        minSkillLevel: 'advanced',
      });
      expect(withFilter.matchedSkills).toHaveLength(0);
      expect(withFilter.missingSkills).toContain('docker');
    });
  });

  describe('Weighted Text Search (PostgreSQL Weight Hierarchy)', () => {
    const candidateA = {
      headline: 'TypeScript Architect', // Weight A
      user: { name: 'Bob Jones' },
      bio: 'Passionate about coding',
      location: 'Berlin',
      skills: [],
      experience: [],
      education: [],
      portfolio: [],
    };

    const candidateB = {
      headline: 'Generalist Developer',
      user: { name: 'Charlie' },
      bio: 'Used some TypeScript in hobby projects', // Weight C
      location: 'Berlin',
      skills: [],
      experience: [],
      education: [],
      portfolio: [],
    };

    it('should rank Weight A (Headline) significantly higher than Weight C (Bio)', () => {
      const scoreA = service.scoreTalentProfile(candidateA, { search: 'TypeScript' });
      const scoreB = service.scoreTalentProfile(candidateB, { search: 'TypeScript' });

      expect(scoreA.textRank).toBeGreaterThan(scoreB.textRank);
      expect(scoreA.textRank).toBeGreaterThanOrEqual(40);
      expect(scoreB.textRank).toBeLessThanOrEqual(25);
    });

    it('should honor negation syntax (-term) by excluding candidates with that term', () => {
      const juniorProfile = {
        headline: 'Junior TypeScript Developer',
        user: { name: 'Dave' },
        skills: [],
        experience: [{ title: 'Junior Intern' }],
      };

      const result = service.scoreTalentProfile(juniorProfile, {
        search: 'TypeScript -junior',
      });

      expect(result.textRank).toBe(0);
      expect(result.compositeScore).toBe(0);
    });

    it('should support quoted exact phrase searches', () => {
      const exactCandidate = {
        headline: 'Lead Cloud Architect and Engineer',
      };
      const separateCandidate = {
        headline: 'Cloud Engineer who strives to lead teams',
      };

      const scoreExact = service.scoreTalentProfile(exactCandidate, { search: '"Lead Cloud"' });
      const scoreSeparate = service.scoreTalentProfile(separateCandidate, { search: '"Lead Cloud"' });

      expect(scoreExact.textRank).toBeGreaterThan(scoreSeparate.textRank);
    });
  });

  describe('Jobs Full-Text Scoring', () => {
    const jobA = {
      title: 'Senior TypeScript Engineer', // Weight A
      category: 'Engineering',
      description: 'Building modern web apps',
      skills: ['TypeScript', 'Node.js'],
      location: 'Remote',
    };

    const jobB = {
      title: 'Product Manager',
      category: 'Product',
      description: 'Must understand TypeScript codebases', // Weight C
      skills: ['Product Strategy'],
      location: 'Remote',
    };

    it('should score job title match (Weight A) higher than description match (Weight C)', () => {
      const scoreA = service.scoreJobFts(jobA, 'TypeScript');
      const scoreB = service.scoreJobFts(jobB, 'TypeScript');

      expect(scoreA).toBeGreaterThan(scoreB);
    });

    it('should penalize or exclude negated terms in job search', () => {
      const internship = {
        title: 'Software Engineer Internship',
      };
      const score = service.scoreJobFts(internship, 'Software -internship');
      expect(score).toBe(0);
    });
  });

  describe('Composite Score Blending', () => {
    const profile = {
      headline: 'Full Stack Engineer',
      skills: [{ name: 'NestJS', level: 'expert', yearsOfExperience: 5 }],
    };

    it('should blend text score and skill score when both criteria are passed', () => {
      const result = service.scoreTalentProfile(profile, {
        search: 'Engineer',
        skills: 'NestJS',
      });

      expect(result.compositeScore).toBeGreaterThan(0);
      expect(result.skillScore).toBeGreaterThan(0);
      expect(result.textRank).toBeGreaterThan(0);
    });
  });
});
