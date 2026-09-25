import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  isValidTimezone,
  normalizeTimezone,
  getLocalizedTimeDetails,
  type LocalizedTimeDetails,
} from './timezone.util.js';
import type {
  SetAvailabilityDto,
  DateOverrideDto,
  WeeklyScheduleSlotDto,
  AvailabilityProfileResponse,
} from './dto/availability.dto.js';
import type { AvailabilitySlotsDto } from './dto/index.js';

export interface CalculatedAvailabilitySlot {
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  durationMinutes: number;
  employerTime: LocalizedTimeDetails;
  candidateTime?: LocalizedTimeDetails;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  // Default schedule: Monday (1) to Friday (5), 09:00 - 17:00
  public static readonly DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleSlotDto[] = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve active availability profile for employer or a specific interviewer.
   */
  async getAvailabilityProfile(
    user: AuthUser,
    interviewerId?: string,
  ): Promise<AvailabilityProfileResponse> {
    const employer = await this.getEmployerProfile(user);
    const targetUserId = interviewerId || null;

    let record = null;
    try {
      if (targetUserId) {
        record = await this.prisma.client.orm.public.InterviewerAvailability
          .where({
            employerId: employer.id,
            userId: targetUserId,
          })
          .first();
      } else {
        record = await this.prisma.client.orm.public.InterviewerAvailability
          .where({
            employerId: employer.id,
            userId: null as any,
          })
          .first();
      }
    } catch {
      // Fallback if DB table not yet seeded
    }

    if (record) {
      return this.formatProfileRecord(record);
    }

    // Default configuration if not configured yet
    return {
      id: `default-${employer.id}`,
      employerId: employer.id,
      userId: targetUserId,
      timezone: 'UTC',
      weeklySchedule: AvailabilityService.DEFAULT_WEEKLY_SCHEDULE,
      dateOverrides: [],
      slotDurationMinutes: 45,
      bufferMinutes: 15,
      minNoticeHours: 24,
      maxInterviewsPerDay: 6,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Set or update availability schedule for employer or an interviewer.
   */
  async setAvailabilityProfile(
    user: AuthUser,
    dto: SetAvailabilityDto,
  ): Promise<AvailabilityProfileResponse> {
    const employer = await this.getEmployerProfile(user);

    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: "${dto.timezone}".`);
    }
    const timezone = normalizeTimezone(dto.timezone || 'UTC');

    // Validate slots
    for (const slot of dto.weeklySchedule) {
      if (slot.startTime >= slot.endTime) {
        throw new BadRequestException(
          `Invalid slot on day ${slot.dayOfWeek}: startTime (${slot.startTime}) must be before endTime (${slot.endTime}).`,
        );
      }
    }

    const targetUserId = dto.interviewerId || null;

    // Check existing
    let existing = null;
    try {
      if (targetUserId) {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: targetUserId })
          .first();
      } else {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: null as any })
          .first();
      }
    } catch {
      // DB check
    }

    const weeklyScheduleJson = JSON.stringify(dto.weeklySchedule);
    const slotDurationMinutes = dto.slotDurationMinutes ?? 45;
    const bufferMinutes = dto.bufferMinutes ?? 15;
    const minNoticeHours = dto.minNoticeHours ?? 24;
    const maxInterviewsPerDay = dto.maxInterviewsPerDay ?? 6;
    const isActive = dto.isActive ?? true;

    if (existing) {
      const updated = await this.prisma.client.orm.public.InterviewerAvailability
        .where({ id: existing.id })
        .update({
          timezone,
          weeklySchedule: weeklyScheduleJson,
          slotDurationMinutes,
          bufferMinutes,
          minNoticeHours,
          maxInterviewsPerDay,
          isActive,
        });
      this.logger.log(`Updated availability schedule #${existing.id} for employer #${employer.id}`);
      return this.formatProfileRecord(updated);
    }

    const id = randomUUID();
    const created = await this.prisma.client.orm.public.InterviewerAvailability.create({
      id,
      employerId: employer.id,
      userId: targetUserId,
      timezone,
      weeklySchedule: weeklyScheduleJson,
      dateOverrides: JSON.stringify([]),
      slotDurationMinutes,
      bufferMinutes,
      minNoticeHours,
      maxInterviewsPerDay,
      isActive,
    });

    this.logger.log(`Created availability schedule #${id} for employer #${employer.id}`);
    return this.formatProfileRecord(created);
  }

  /**
   * Add or update a specific date override (e.g. company holiday, PTO, or custom hours).
   */
  async addDateOverride(
    user: AuthUser,
    dto: DateOverrideDto,
    interviewerId?: string,
  ): Promise<AvailabilityProfileResponse> {
    const employer = await this.getEmployerProfile(user);
    const profile = await this.getAvailabilityProfile(user, interviewerId);

    if (!dto.isBlocked && dto.startTime && dto.endTime) {
      if (dto.startTime >= dto.endTime) {
        throw new BadRequestException(`startTime (${dto.startTime}) must be before endTime (${dto.endTime}).`);
      }
    }

    const overrides = profile.dateOverrides.filter((o) => o.date !== dto.date);
    overrides.push(dto);
    overrides.sort((a, b) => a.date.localeCompare(b.date));

    // Ensure database record exists
    let existing = null;
    try {
      if (interviewerId) {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: interviewerId })
          .first();
      } else {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: null as any })
          .first();
      }
    } catch {
      //
    }

    const overridesJson = JSON.stringify(overrides);

    if (existing) {
      const updated = await this.prisma.client.orm.public.InterviewerAvailability
        .where({ id: existing.id })
        .update({
          dateOverrides: overridesJson,
        });
      return this.formatProfileRecord(updated);
    }

    const created = await this.prisma.client.orm.public.InterviewerAvailability.create({
      id: randomUUID(),
      employerId: employer.id,
      userId: interviewerId || null,
      timezone: profile.timezone,
      weeklySchedule: JSON.stringify(profile.weeklySchedule),
      dateOverrides: overridesJson,
      slotDurationMinutes: profile.slotDurationMinutes,
      bufferMinutes: profile.bufferMinutes,
      minNoticeHours: profile.minNoticeHours,
      maxInterviewsPerDay: profile.maxInterviewsPerDay,
      isActive: true,
    });

    return this.formatProfileRecord(created);
  }

  /**
   * Remove a specific date override.
   */
  async removeDateOverride(
    user: AuthUser,
    date: string,
    interviewerId?: string,
  ): Promise<AvailabilityProfileResponse> {
    const employer = await this.getEmployerProfile(user);
    const profile = await this.getAvailabilityProfile(user, interviewerId);

    const overrides = profile.dateOverrides.filter((o) => o.date !== date);

    let existing = null;
    try {
      if (interviewerId) {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: interviewerId })
          .first();
      } else {
        existing = await this.prisma.client.orm.public.InterviewerAvailability
          .where({ employerId: employer.id, userId: null as any })
          .first();
      }
    } catch {
      //
    }

    if (existing) {
      const updated = await this.prisma.client.orm.public.InterviewerAvailability
        .where({ id: existing.id })
        .update({
          dateOverrides: JSON.stringify(overrides),
        });
      return this.formatProfileRecord(updated);
    }

    profile.dateOverrides = overrides;
    return profile;
  }

  /**
   * Compute available open slots respecting working schedules, capacity, blackout dates, and notice.
   */
  async computeAvailableSlots(
    employerId: string,
    dto: AvailabilitySlotsDto,
  ): Promise<CalculatedAvailabilitySlot[]> {
    const startRange = new Date(dto.startDate);
    const endRange = new Date(dto.endDate);

    if (isNaN(startRange.getTime()) || isNaN(endRange.getTime())) {
      throw new BadRequestException('startDate and endDate must be valid dates (YYYY-MM-DD).');
    }
    if (startRange > endRange) {
      throw new BadRequestException('startDate must be before or equal to endDate.');
    }

    // Load employer availability profile
    let profileRecord = null;
    try {
      profileRecord = await this.prisma.client.orm.public.InterviewerAvailability
        .where({ employerId, userId: null as any })
        .first();
    } catch {
      //
    }

    const timezone = normalizeTimezone(dto.timezone || profileRecord?.timezone || 'UTC');
    const candidateTz = dto.candidateTimezone ? normalizeTimezone(dto.candidateTimezone) : undefined;
    const slotDuration = dto.slotDurationMinutes || profileRecord?.slotDurationMinutes || 45;
    const bufferMinutes = dto.bufferMinutes ?? profileRecord?.bufferMinutes ?? 15;
    const minNoticeHours = profileRecord?.minNoticeHours ?? 24;
    const maxPerDay = profileRecord?.maxInterviewsPerDay ?? 6;

    let weeklySchedule: WeeklyScheduleSlotDto[] = AvailabilityService.DEFAULT_WEEKLY_SCHEDULE;
    let dateOverrides: DateOverrideDto[] = [];

    if (profileRecord) {
      try {
        weeklySchedule = JSON.parse(profileRecord.weeklySchedule);
      } catch {
        weeklySchedule = AvailabilityService.DEFAULT_WEEKLY_SCHEDULE;
      }
      try {
        dateOverrides = JSON.parse(profileRecord.dateOverrides);
      } catch {
        dateOverrides = [];
      }
    }

    // Override working hours if explicitly specified in request
    if (dto.workingHoursStart && dto.workingHoursEnd) {
      weeklySchedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        dayOfWeek: day,
        startTime: dto.workingHoursStart!,
        endTime: dto.workingHoursEnd!,
      }));
    }

    // Minimum notice threshold in UTC
    const minNoticeTime = Date.now() + minNoticeHours * 3600 * 1000;

    // Fetch existing interviews across employer
    let existingInterviews: any[] = [];
    try {
      const scheduledResult = this.prisma.client.orm.public.JobInterview.where({
        employerId,
        status: 'scheduled',
      });
      const rescheduledResult = this.prisma.client.orm.public.JobInterview.where({
        employerId,
        status: 'rescheduled',
      });
      const [sList, rList] = await Promise.all([
        scheduledResult?.all ? scheduledResult.all() : [],
        rescheduledResult?.all ? rescheduledResult.all() : [],
      ]);
      existingInterviews = [...(sList || []), ...(rList || [])];
    } catch {
      existingInterviews = [];
    }

    const availableSlots: CalculatedAvailabilitySlot[] = [];

    // Scan day by day
    const current = new Date(startRange);
    while (current <= endRange) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getUTCDay(); // 0 = Sun .. 6 = Sat

      // Check date override
      const override = dateOverrides.find((o) => o.date === dateStr);
      if (override?.isBlocked) {
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      // Determine working slots for the day
      let daySlots: Array<{ startTime: string; endTime: string }> = [];
      if (override && override.startTime && override.endTime) {
        daySlots = [{ startTime: override.startTime, endTime: override.endTime }];
      } else {
        daySlots = weeklySchedule.filter((s) => s.dayOfWeek === dayOfWeek);
      }

      if (daySlots.length === 0) {
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      // Check daily capacity
      const interviewsOnDate = existingInterviews.filter((iv) => {
        const ivDateStr = new Date(iv.startTime).toISOString().split('T')[0];
        return ivDateStr === dateStr;
      });

      if (interviewsOnDate.length >= maxPerDay) {
        current.setUTCDate(current.getUTCDate() + 1);
        continue;
      }

      // Generate candidate slots within working intervals
      for (const win of daySlots) {
        const [startH, startM] = win.startTime.split(':').map(Number);
        const [endH, endM] = win.endTime.split(':').map(Number);

        // Build UTC timestamps for the working window in employer's timezone
        const windowStart = new Date(`${dateStr}T${win.startTime}:00.000Z`);
        const windowEnd = new Date(`${dateStr}T${win.endTime}:00.000Z`);

        let slotCursor = new Date(windowStart);
        while (true) {
          const slotEnd = new Date(slotCursor.getTime() + slotDuration * 60 * 1000);
          if (slotEnd > windowEnd) break;

          // Check notice threshold
          if (slotCursor.getTime() >= minNoticeTime) {
            // Check collision with existing booked interviews including buffer
            let hasCollision = false;
            for (const booked of existingInterviews) {
              const bStart = new Date(booked.startTime).getTime() - bufferMinutes * 60 * 1000;
              const bEnd = new Date(booked.endTime).getTime() + bufferMinutes * 60 * 1000;

              if (slotCursor.getTime() < bEnd && slotEnd.getTime() > bStart) {
                hasCollision = true;
                break;
              }
            }

            if (!hasCollision) {
              const startIso = slotCursor.toISOString();
              const endIso = slotEnd.toISOString();

              availableSlots.push({
                startTime: startIso,
                endTime: endIso,
                durationMinutes: slotDuration,
                employerTime: getLocalizedTimeDetails(startIso, timezone),
                candidateTime: candidateTz
                  ? getLocalizedTimeDetails(startIso, candidateTz)
                  : undefined,
              });
            }
          }

          // Advance by slotDuration + buffer
          slotCursor = new Date(slotCursor.getTime() + (slotDuration + bufferMinutes) * 60 * 1000);
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return availableSlots;
  }

  private formatProfileRecord(record: any): AvailabilityProfileResponse {
    let weeklySchedule: WeeklyScheduleSlotDto[] = AvailabilityService.DEFAULT_WEEKLY_SCHEDULE;
    let dateOverrides: DateOverrideDto[] = [];

    try {
      weeklySchedule = JSON.parse(record.weeklySchedule);
    } catch {
      weeklySchedule = AvailabilityService.DEFAULT_WEEKLY_SCHEDULE;
    }

    try {
      dateOverrides = JSON.parse(record.dateOverrides);
    } catch {
      dateOverrides = [];
    }

    return {
      id: record.id,
      employerId: record.employerId,
      userId: record.userId || null,
      timezone: record.timezone || 'UTC',
      weeklySchedule,
      dateOverrides,
      slotDurationMinutes: record.slotDurationMinutes || 45,
      bufferMinutes: record.bufferMinutes ?? 15,
      minNoticeHours: record.minNoticeHours ?? 24,
      maxInterviewsPerDay: record.maxInterviewsPerDay ?? 6,
      isActive: record.isActive ?? true,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async getEmployerProfile(user: AuthUser) {
    const profile = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!profile) {
      if (user.role === Role.ADMIN) {
        const firstEmployer = await this.prisma.client.orm.public.EmployerProfile.all();
        if (firstEmployer.length > 0) return firstEmployer[0];
      }
      throw new NotFoundException('Employer profile not found for this account.');
    }
    return profile;
  }
}
