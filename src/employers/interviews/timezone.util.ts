/**
 * Timezone utility functions for Fruitful Journey ATS.
 * Provides IANA timezone validation, localized formatting, UTC offset extraction,
 * and timezone conversion helpers.
 */

export interface TimezoneInfo {
  value: string;
  label: string;
  region: string;
  offset: string;
  offsetMinutes: number;
  abbreviation: string;
}

export interface LocalizedTimeDetails {
  isoUtc: string;
  timezone: string;
  formatted: string;
  formattedShort: string;
  timeString: string;
  dateString: string;
  offset: string;
  offsetMinutes: number;
  abbreviation: string;
}

/**
 * Standard list of globally recognized IANA timezones grouped by region.
 */
export const SUPPORTED_TIMEZONES: TimezoneInfo[] = [
  // UTC / Universal
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)', region: 'Universal', offset: '+00:00', offsetMinutes: 0, abbreviation: 'UTC' },

  // Africa
  { value: 'Africa/Nairobi', label: 'Nairobi, East Africa (EAT)', region: 'Africa', offset: '+03:00', offsetMinutes: 180, abbreviation: 'EAT' },
  { value: 'Africa/Lagos', label: 'Lagos, West Africa (WAT)', region: 'Africa', offset: '+01:00', offsetMinutes: 60, abbreviation: 'WAT' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg, South Africa (SAST)', region: 'Africa', offset: '+02:00', offsetMinutes: 120, abbreviation: 'SAST' },
  { value: 'Africa/Cairo', label: 'Cairo, Egypt (EEST)', region: 'Africa', offset: '+03:00', offsetMinutes: 180, abbreviation: 'EEST' },
  { value: 'Africa/Casablanca', label: 'Casablanca, Morocco (WEST)', region: 'Africa', offset: '+01:00', offsetMinutes: 60, abbreviation: 'WEST' },
  { value: 'Africa/Accra', label: 'Accra, Ghana (GMT)', region: 'Africa', offset: '+00:00', offsetMinutes: 0, abbreviation: 'GMT' },

  // Europe
  { value: 'Europe/London', label: 'London, United Kingdom (GMT/BST)', region: 'Europe', offset: '+01:00', offsetMinutes: 60, abbreviation: 'BST' },
  { value: 'Europe/Paris', label: 'Paris, France (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Berlin', label: 'Berlin, Germany (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Madrid', label: 'Madrid, Spain (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Rome', label: 'Rome, Italy (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Zurich', label: 'Zurich, Switzerland (CET/CEST)', region: 'Europe', offset: '+02:00', offsetMinutes: 120, abbreviation: 'CEST' },
  { value: 'Europe/Athens', label: 'Athens, Greece (EET/EEST)', region: 'Europe', offset: '+03:00', offsetMinutes: 180, abbreviation: 'EEST' },
  { value: 'Europe/Dublin', label: 'Dublin, Ireland (IST/GMT)', region: 'Europe', offset: '+01:00', offsetMinutes: 60, abbreviation: 'IST' },

  // Americas
  { value: 'America/New_York', label: 'New York, US Eastern (EDT/EST)', region: 'Americas', offset: '-04:00', offsetMinutes: -240, abbreviation: 'EDT' },
  { value: 'America/Chicago', label: 'Chicago, US Central (CDT/CST)', region: 'Americas', offset: '-05:00', offsetMinutes: -300, abbreviation: 'CDT' },
  { value: 'America/Denver', label: 'Denver, US Mountain (MDT/MST)', region: 'Americas', offset: '-06:00', offsetMinutes: -360, abbreviation: 'MDT' },
  { value: 'America/Los_Angeles', label: 'Los Angeles, US Pacific (PDT/PST)', region: 'Americas', offset: '-07:00', offsetMinutes: -420, abbreviation: 'PDT' },
  { value: 'America/Toronto', label: 'Toronto, Canada (EDT/EST)', region: 'Americas', offset: '-04:00', offsetMinutes: -240, abbreviation: 'EDT' },
  { value: 'America/Vancouver', label: 'Vancouver, Canada (PDT/PST)', region: 'Americas', offset: '-07:00', offsetMinutes: -420, abbreviation: 'PDT' },
  { value: 'America/Sao_Paulo', label: 'São Paulo, Brazil (BRT)', region: 'Americas', offset: '-03:00', offsetMinutes: -180, abbreviation: 'BRT' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires, Argentina (ART)', region: 'Americas', offset: '-03:00', offsetMinutes: -180, abbreviation: 'ART' },
  { value: 'America/Mexico_City', label: 'Mexico City, Mexico (CST)', region: 'Americas', offset: '-06:00', offsetMinutes: -360, abbreviation: 'CST' },
  { value: 'America/Bogota', label: 'Bogota, Colombia (COT)', region: 'Americas', offset: '-05:00', offsetMinutes: -300, abbreviation: 'COT' },

  // Asia & Middle East
  { value: 'Asia/Dubai', label: 'Dubai, UAE (GST)', region: 'Asia & Middle East', offset: '+04:00', offsetMinutes: 240, abbreviation: 'GST' },
  { value: 'Asia/Riyadh', label: 'Riyadh, Saudi Arabia (AST)', region: 'Asia & Middle East', offset: '+03:00', offsetMinutes: 180, abbreviation: 'AST' },
  { value: 'Asia/Kolkata', label: 'India (IST)', region: 'Asia & Middle East', offset: '+05:30', offsetMinutes: 330, abbreviation: 'IST' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', region: 'Asia & Middle East', offset: '+08:00', offsetMinutes: 480, abbreviation: 'SGT' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', region: 'Asia & Middle East', offset: '+08:00', offsetMinutes: 480, abbreviation: 'HKT' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Japan (JST)', region: 'Asia & Middle East', offset: '+09:00', offsetMinutes: 540, abbreviation: 'JST' },
  { value: 'Asia/Seoul', label: 'Seoul, South Korea (KST)', region: 'Asia & Middle East', offset: '+09:00', offsetMinutes: 540, abbreviation: 'KST' },
  { value: 'Asia/Shanghai', label: 'Beijing / Shanghai, China (CST)', region: 'Asia & Middle East', offset: '+08:00', offsetMinutes: 480, abbreviation: 'CST' },
  { value: 'Asia/Bangkok', label: 'Bangkok, Thailand (ICT)', region: 'Asia & Middle East', offset: '+07:00', offsetMinutes: 420, abbreviation: 'ICT' },
  { value: 'Asia/Jakarta', label: 'Jakarta, Indonesia (WIB)', region: 'Asia & Middle East', offset: '+07:00', offsetMinutes: 420, abbreviation: 'WIB' },

  // Pacific & Oceania
  { value: 'Australia/Sydney', label: 'Sydney, Australia (AEST/AEDT)', region: 'Pacific & Oceania', offset: '+10:00', offsetMinutes: 600, abbreviation: 'AEST' },
  { value: 'Australia/Melbourne', label: 'Melbourne, Australia (AEST/AEDT)', region: 'Pacific & Oceania', offset: '+10:00', offsetMinutes: 600, abbreviation: 'AEST' },
  { value: 'Australia/Perth', label: 'Perth, Australia (AWST)', region: 'Pacific & Oceania', offset: '+08:00', offsetMinutes: 480, abbreviation: 'AWST' },
  { value: 'Pacific/Auckland', label: 'Auckland, New Zealand (NZST/NZDT)', region: 'Pacific & Oceania', offset: '+12:00', offsetMinutes: 720, abbreviation: 'NZST' },
  { value: 'Pacific/Honolulu', label: 'Honolulu, Hawaii (HST)', region: 'Pacific & Oceania', offset: '-10:00', offsetMinutes: -600, abbreviation: 'HST' },
];

/**
 * Check whether a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  const clean = tz.trim();
  if (clean.toUpperCase() === 'UTC' || clean.toUpperCase() === 'GMT') return true;

  try {
    Intl.DateTimeFormat(undefined, { timeZone: clean });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize and sanitize timezone identifier, falling back to 'UTC' if invalid.
 */
export function normalizeTimezone(tz?: string | null): string {
  if (!tz) return 'UTC';
  const clean = tz.trim();
  if (clean.toUpperCase() === 'UTC' || clean.toUpperCase() === 'GMT') return 'UTC';
  return isValidTimezone(clean) ? clean : 'UTC';
}

/**
 * Calculates current UTC offset in minutes for a given timezone and date.
 */
export function getTimezoneOffsetMinutes(tz: string, date: Date = new Date()): number {
  const normalized = normalizeTimezone(tz);
  if (normalized === 'UTC') return 0;

  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: normalized }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60));
  } catch {
    return 0;
  }
}

/**
 * Format UTC offset into "+HH:MM" or "-HH:MM" string.
 */
export function getTimezoneOffsetString(tz: string, date: Date = new Date()): string {
  const totalMinutes = getTimezoneOffsetMinutes(tz, date);
  const sign = totalMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60).toString().padStart(2, '0');
  const minutes = (absMinutes % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Extract timezone abbreviation (e.g. EAT, EDT, GMT, PST).
 */
export function getTimezoneAbbreviation(tz: string, date: Date = new Date()): string {
  const normalized = normalizeTimezone(tz);
  if (normalized === 'UTC') return 'UTC';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      timeZoneName: 'short',
    }).formatToParts(date);

    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : getTimezoneOffsetString(normalized, date);
  } catch {
    return getTimezoneOffsetString(normalized, date);
  }
}

/**
 * Format a Date or ISO string nicely within a specific timezone.
 */
export function formatInTimezone(
  date: Date | string,
  tz: string,
  style: 'full' | 'short' | 'time_only' | 'date_only' = 'full',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const normalized = normalizeTimezone(tz);

  try {
    if (style === 'time_only') {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: normalized,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d);
    }

    if (style === 'date_only') {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: normalized,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(d);
    }

    if (style === 'short') {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: normalized,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      }).format(d);
    }

    // Default 'full'
    return new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Returns comprehensive localized details for a given timestamp and timezone.
 */
export function getLocalizedTimeDetails(
  isoString: string,
  tz: string,
): LocalizedTimeDetails {
  const d = new Date(isoString);
  const normalized = normalizeTimezone(tz);

  return {
    isoUtc: d.toISOString(),
    timezone: normalized,
    formatted: formatInTimezone(d, normalized, 'full'),
    formattedShort: formatInTimezone(d, normalized, 'short'),
    timeString: formatInTimezone(d, normalized, 'time_only'),
    dateString: formatInTimezone(d, normalized, 'date_only'),
    offset: getTimezoneOffsetString(normalized, d),
    offsetMinutes: getTimezoneOffsetMinutes(normalized, d),
    abbreviation: getTimezoneAbbreviation(normalized, d),
  };
}

/**
 * Convert an ISO timestamp to target timezone with delta hours.
 */
export function convertTimestamp(
  isoString: string,
  fromTz: string,
  toTz: string,
) {
  const d = new Date(isoString);
  const fromNormalized = normalizeTimezone(fromTz);
  const toNormalized = normalizeTimezone(toTz);

  const sourceDetails = getLocalizedTimeDetails(isoString, fromNormalized);
  const targetDetails = getLocalizedTimeDetails(isoString, toNormalized);

  const deltaMinutes = targetDetails.offsetMinutes - sourceDetails.offsetMinutes;
  const deltaHours = Number((deltaMinutes / 60).toFixed(1));

  return {
    utcIso: d.toISOString(),
    source: sourceDetails,
    target: targetDetails,
    difference: {
      deltaHours,
      deltaMinutes,
      summary:
        deltaHours === 0
          ? 'Same time zone'
          : `${Math.abs(deltaHours)} hour(s) ${deltaHours > 0 ? 'ahead' : 'behind'} source`,
    },
  };
}
