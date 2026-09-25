import { describe, it, expect } from 'vitest';
import {
  isValidTimezone,
  normalizeTimezone,
  getTimezoneOffsetMinutes,
  getTimezoneOffsetString,
  getTimezoneAbbreviation,
  formatInTimezone,
  getLocalizedTimeDetails,
  convertTimestamp,
  SUPPORTED_TIMEZONES,
} from './timezone.util.js';

describe('timezone.util', () => {
  describe('isValidTimezone', () => {
    it('should return true for valid IANA timezones', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('GMT')).toBe(true);
      expect(isValidTimezone('Africa/Nairobi')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    });

    it('should return false for invalid or garbage timezones', () => {
      expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('NotATimezone')).toBe(false);
      expect(isValidTimezone(null as any)).toBe(false);
    });
  });

  describe('normalizeTimezone', () => {
    it('should return trimmed valid timezone', () => {
      expect(normalizeTimezone('  Africa/Nairobi  ')).toBe('Africa/Nairobi');
      expect(normalizeTimezone('UTC')).toBe('UTC');
      expect(normalizeTimezone('gmt')).toBe('UTC');
    });

    it('should fallback to UTC when invalid or missing', () => {
      expect(normalizeTimezone('InvalidZone')).toBe('UTC');
      expect(normalizeTimezone(null)).toBe('UTC');
      expect(normalizeTimezone(undefined)).toBe('UTC');
    });
  });

  describe('getTimezoneOffsetMinutes & getTimezoneOffsetString', () => {
    it('should calculate UTC offset in minutes and string format', () => {
      expect(getTimezoneOffsetMinutes('UTC')).toBe(0);
      expect(getTimezoneOffsetString('UTC')).toBe('+00:00');

      // Nairobi is consistently UTC+3 (180 mins) without DST
      expect(getTimezoneOffsetMinutes('Africa/Nairobi')).toBe(180);
      expect(getTimezoneOffsetString('Africa/Nairobi')).toBe('+03:00');

      // Tokyo is consistently UTC+9 (540 mins) without DST
      expect(getTimezoneOffsetMinutes('Asia/Tokyo')).toBe(540);
      expect(getTimezoneOffsetString('Asia/Tokyo')).toBe('+09:00');
    });
  });

  describe('getTimezoneAbbreviation', () => {
    it('should return standard abbreviations', () => {
      expect(getTimezoneAbbreviation('UTC')).toBe('UTC');
      const eat = getTimezoneAbbreviation('Africa/Nairobi');
      expect(eat).toBeDefined();
      expect(typeof eat).toBe('string');
    });
  });

  describe('formatInTimezone', () => {
    const fixedUtc = '2026-10-15T12:00:00.000Z';

    it('should format full date and time string in target timezone', () => {
      const formattedNairobi = formatInTimezone(fixedUtc, 'Africa/Nairobi', 'full');
      expect(formattedNairobi).toContain('2026');
      expect(formattedNairobi).toContain('3:00 PM'); // 12:00 UTC is 15:00 EAT

      const formattedNewYork = formatInTimezone(fixedUtc, 'America/New_York', 'full');
      expect(formattedNewYork).toContain('2026');
      expect(formattedNewYork).toContain('8:00 AM'); // 12:00 UTC is 08:00 EDT
    });

    it('should format time only', () => {
      const timeNairobi = formatInTimezone(fixedUtc, 'Africa/Nairobi', 'time_only');
      expect(timeNairobi).toBe('3:00 PM');
    });

    it('should format date only', () => {
      const dateNairobi = formatInTimezone(fixedUtc, 'Africa/Nairobi', 'date_only');
      expect(dateNairobi).toContain('2026');
      expect(dateNairobi).toContain('Oct');
    });
  });

  describe('getLocalizedTimeDetails', () => {
    it('should return complete localized details object', () => {
      const fixedUtc = '2026-10-15T10:30:00.000Z';
      const details = getLocalizedTimeDetails(fixedUtc, 'Africa/Nairobi');

      expect(details.isoUtc).toBe(fixedUtc);
      expect(details.timezone).toBe('Africa/Nairobi');
      expect(details.timeString).toBe('1:30 PM');
      expect(details.offset).toBe('+03:00');
      expect(details.offsetMinutes).toBe(180);
      expect(details.formatted).toBeDefined();
    });
  });

  describe('convertTimestamp', () => {
    it('should accurately compute time difference and source/target details', () => {
      const fixedUtc = '2026-10-15T10:00:00.000Z';
      const result = convertTimestamp(fixedUtc, 'America/New_York', 'Africa/Nairobi');

      expect(result.source.timezone).toBe('America/New_York');
      expect(result.target.timezone).toBe('Africa/Nairobi');
      expect(result.difference.deltaHours).toBe(7); // EDT (-4) to EAT (+3) is +7 hours
      expect(result.difference.summary).toContain('7 hour(s) ahead');
    });
  });

  describe('SUPPORTED_TIMEZONES', () => {
    it('should contain a curated list covering all continents', () => {
      expect(SUPPORTED_TIMEZONES.length).toBeGreaterThan(25);
      const regions = new Set(SUPPORTED_TIMEZONES.map((t) => t.region));
      expect(regions.has('Africa')).toBe(true);
      expect(regions.has('Europe')).toBe(true);
      expect(regions.has('Americas')).toBe(true);
      expect(regions.has('Asia & Middle East')).toBe(true);
      expect(regions.has('Pacific & Oceania')).toBe(true);
    });
  });
});
