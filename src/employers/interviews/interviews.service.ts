import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { AvailabilityService } from './availability.service.js';
import { CalendarEventsService } from './calendar-events.service.js';
import {
  ScheduleInterviewDto,
  UpdateInterviewDto,
  RescheduleInterviewDto,
  CancelInterviewDto,
  CompleteInterviewDto,
  QueryInterviewsDto,
  CheckConflictDto,
  AvailabilitySlotsDto,
  ConvertTimezoneDto,
  CalendarViewDto,
  CandidateRescheduleRequestDto,
  CandidateDirectRescheduleDto,
  CandidateCancelInterviewDto,
  ProcessRemindersDto,
  SendManualReminderDto,
  InterviewStatus,
} from './dto/index.js';
import { InterviewRemindersService } from './interview-reminders.service.js';
import { CalendarIntegrationsService } from './calendar-sync/calendar-integrations.service.js';
import {
  SUPPORTED_TIMEZONES,
  isValidTimezone,
  normalizeTimezone,
  getTimezoneOffsetMinutes,
  getLocalizedTimeDetails,
  convertTimestamp,
  LocalizedTimeDetails,
} from './timezone.util.js';

export interface EnrichedInterview {
  id: string;
  applicationId: string;
  employerId: string;
  candidateId: string;
  jobId: string;
  title: string;
  interviewType: string;
  status: string;
  startTime: string;
  endTime: string;
  timezone: string;
  durationMinutes?: number;
  meetingLink: string | null;
  location: string | null;
  interviewerIds: string[];
  notes: string | null;
  candidateInstructions: string | null;
  rating: number | null;
  feedbackSummary: string | null;
  cancellationReason: string | null;
  reminderSent24h: boolean;
  reminderSent1h: boolean;
  reminderSent15m?: boolean;
  rescheduledCount?: number;
  rescheduledFrom?: string | null;
  rescheduledReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  localTime?: LocalizedTimeDetails;
  candidateLocalTime?: LocalizedTimeDetails;
  candidate?: {
    id: string;
    userId: string;
    name: string | null;
    email: string;
    headline: string | null;
    photoUrl: string | null;
  };
  job?: {
    id: string;
    title: string;
    companyName: string;
  };
  interviewers?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  googleCalendarUrl?: string;
  calendarLinks?: {
    google: string;
    outlook: string;
    yahoo: string;
    ics: string;
  };
}

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly availabilityService?: AvailabilityService,
    @Optional()
    private readonly calendarEventsService?: CalendarEventsService,
    @Optional()
    private readonly remindersService?: InterviewRemindersService,
    @Optional()
    private readonly calendarIntegrationsService?: CalendarIntegrationsService,
  ) {}

  /**
   * Schedule a new interview for a candidate application with conflict detection.
   */
  async scheduleInterview(user: AuthUser, dto: ScheduleInterviewDto): Promise<EnrichedInterview> {
    const employer = await this.getEmployerProfile(user);

    // Verify application exists
    const application = await this.prisma.client.orm.public.JobApplication
      .where({ id: dto.applicationId })
      .first();

    if (!application) {
      throw new NotFoundException(`Application #${dto.applicationId} not found.`);
    }

    // Verify job belongs to employer
    const job = await this.prisma.client.orm.public.Job
      .where({ id: application.jobId })
      .first();

    if (!job || (job.employerId !== employer.id && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to schedule interviews for this application.');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startTime or endTime ISO timestamp.');
    }
    if (start >= end) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    // Candidate profile & user
    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: application.profileId })
      .first();

    if (!candidateProfile) {
      throw new NotFoundException('Candidate profile not found.');
    }

    const candidateUser = await this.prisma.client.orm.public.User
      .where({ id: candidateProfile.userId })
      .first();

    const timezone = normalizeTimezone(dto.timezone);
    const interviewerIds = dto.interviewerIds || [user.id];

    // Conflict detection
    if (!dto.allowOverlap) {
      const conflictCheck = await this.checkSchedulingConflict(
        start,
        end,
        candidateProfile.id,
        interviewerIds,
        undefined,
        dto.applicationId,
      );
      if (conflictCheck.hasConflict) {
        throw new ConflictException({
          message: 'Interview scheduling conflict detected for candidate or interviewer.',
          conflicts: conflictCheck.conflicts,
        });
      }
    }

    const interviewId = randomUUID();
    let meetingLink = dto.meetingLink || null;
    const interviewType = dto.interviewType || 'video';

    if (!meetingLink && interviewType === 'video') {
      meetingLink = await this.createDailyCoRoom(interviewId, end);
    }

    const created = await this.prisma.client.orm.public.JobInterview.create({
      id: interviewId,
      applicationId: application.id,
      employerId: employer.id,
      candidateId: candidateProfile.id,
      jobId: job.id,
      title: dto.title.trim(),
      interviewType,
      status: InterviewStatus.SCHEDULED,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      timezone,
      meetingLink,
      location: dto.location || null,
      interviewerIds,
      notes: dto.notes || null,
      candidateInstructions: dto.candidateInstructions || null,
      rating: null,
      feedbackSummary: null,
      cancellationReason: null,
      reminderSent24h: false,
      reminderSent1h: false,
    });

    // Advance application status to interviewing if still in earlier stages
    if (['submitted', 'under_review'].includes(application.status)) {
      await this.prisma.client.orm.public.JobApplication
        .where({ id: application.id })
        .update({
          status: 'interviewing',
          stageMovedAt: new Date().toISOString(),
        });

      await this.prisma.client.orm.public.ApplicationStatusHistory.create({
        id: randomUUID(),
        applicationId: application.id,
        previousStatus: application.status,
        newStatus: 'interviewing',
        changedById: user.id,
        changedByRole: user.role,
        notes: `Interview scheduled: "${dto.title}" on ${start.toISOString()} (${timezone})`,
      });
    }

    // Gather interviewer emails
    let interviewerEmails: string[] = [];
    if (interviewerIds.length > 0) {
      try {
        const users = await this.prisma.client.orm.public.User
          .where({ id: interviewerIds as any })
          .all?.();
        interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
      } catch {
        // Continue if DB retrieval skipped
      }
    }

    // Sync to persistent CalendarEvent
    if (this.calendarEventsService) {
      try {
        await this.calendarEventsService.syncInterviewCalendarEvent(
          created,
          employer,
          candidateUser,
          job,
          interviewerEmails,
        );
      } catch (err) {
        this.logger.warn(`Failed to sync calendar event for interview #${interviewId}: ${err}`);
      }
    }

    const enriched = await this.enrichInterviewRecord(
      created,
      candidateUser,
      candidateProfile,
      job,
      dto.candidateTimezone,
    );

    // Build standard .ics calendar invite content
    let icsContent: string | null = null;
    try {
      icsContent = this.buildIcsCalendarContent(enriched, 'REQUEST');
    } catch {
      // Continue if formatting skipped
    }

    // Send rich email notification to candidate & assigned interviewers with .ics attachment
    if (candidateUser && this.notificationsService) {
      await this.notificationsService.sendInterviewNotification({
        candidateUserId: candidateUser.id,
        candidateEmail: candidateUser.email,
        candidateName: candidateUser.name || 'Candidate',
        employerName: employer.name || 'Fruitful Employer',
        jobTitle: job.title,
        interviewId,
        interviewTitle: dto.title,
        interviewType,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timezone,
        candidateTimezone: dto.candidateTimezone,
        meetingLink,
        location: dto.location,
        candidateInstructions: dto.candidateInstructions,
        interviewerEmails,
        organizerEmail: employer.contactEmail || undefined,
        icsAttachment: icsContent
          ? {
              filename: `interview-${interviewId.slice(0, 8)}.ics`,
              content: icsContent,
            }
          : undefined,
      });
    }

    this.logger.log(
      `Scheduled interview #${interviewId} for candidate #${candidateProfile.id} by employer #${employer.id}`,
    );

    return enriched;
  }

  /**
   * Check for overlapping interviews for a candidate or interviewers.
   */
  async checkSchedulingConflict(
    start: Date,
    end: Date,
    candidateId?: string,
    interviewerIds: string[] = [],
    excludeInterviewId?: string,
    excludeApplicationId?: string,
  ): Promise<{
    hasConflict: boolean;
    conflicts: Array<{
      type: 'candidate' | 'interviewer';
      interviewId: string;
      title: string;
      startTime: string;
      endTime: string;
      interviewerId?: string;
    }>;
  }> {
    let scheduledInterviews: any[] = [];
    let rescheduledInterviews: any[] = [];

    try {
      const scheduledResult = this.prisma.client.orm.public.JobInterview.where({
        status: InterviewStatus.SCHEDULED,
      });
      scheduledInterviews = (await scheduledResult?.all?.()) || [];
    } catch {
      scheduledInterviews = [];
    }

    try {
      const rescheduledResult = this.prisma.client.orm.public.JobInterview.where({
        status: InterviewStatus.RESCHEDULED,
      });
      rescheduledInterviews = (await rescheduledResult?.all?.()) || [];
    } catch {
      rescheduledInterviews = [];
    }

    const pool = [...scheduledInterviews, ...rescheduledInterviews];
    const startMs = start.getTime();
    const endMs = end.getTime();
    const conflicts: any[] = [];

    for (const item of pool) {
      if (excludeInterviewId && item.id === excludeInterviewId) continue;
      if (excludeApplicationId && item.applicationId === excludeApplicationId) continue;

      const itemStartMs = new Date(item.startTime).getTime();
      const itemEndMs = new Date(item.endTime).getTime();

      // Interval overlap check: startA < endB && endA > startB
      const overlaps = startMs < itemEndMs && endMs > itemStartMs;
      if (!overlaps) continue;

      // Candidate conflict
      if (candidateId && item.candidateId === candidateId) {
        conflicts.push({
          type: 'candidate',
          interviewId: item.id,
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
        });
      }

      // Interviewer conflict
      if (interviewerIds.length > 0 && item.interviewerIds) {
        const matchingInterviewer = item.interviewerIds.find((id: string) =>
          interviewerIds.includes(id),
        );
        if (matchingInterviewer) {
          conflicts.push({
            type: 'interviewer',
            interviewId: item.id,
            title: item.title,
            startTime: item.startTime,
            endTime: item.endTime,
            interviewerId: matchingInterviewer,
          });
        }
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Public conflict check endpoint.
   */
  async checkConflicts(user: AuthUser, dto: CheckConflictDto) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startTime or endTime ISO timestamp.');
    }
    if (start >= end) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    let candidateId = dto.candidateId;
    if (!candidateId && dto.applicationId) {
      const app = await this.prisma.client.orm.public.JobApplication
        .where({ id: dto.applicationId })
        .first();
      candidateId = app?.profileId;
    }

    return this.checkSchedulingConflict(
      start,
      end,
      candidateId,
      dto.interviewerIds || [user.id],
      dto.excludeInterviewId,
    );
  }

  /**
   * Find available open interview slots across a date range in the employer's timezone.
   */
  async getAvailabilitySlots(user: AuthUser, dto: AvailabilitySlotsDto) {
    const employer = await this.getEmployerProfile(user);
    const timezone = normalizeTimezone(dto.timezone);
    const candidateTz = dto.candidateTimezone ? normalizeTimezone(dto.candidateTimezone) : null;
    const durationMins = dto.slotDurationMinutes || 45;
    const bufferMins = dto.bufferMinutes ?? 15;

    const startDate = new Date(`${dto.startDate}T00:00:00`);
    const endDate = new Date(`${dto.endDate}T23:59:59`);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid startDate or endDate format (expected YYYY-MM-DD).');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate.');
    }

    // Delegate to advanced AvailabilityService if injected
    if (this.availabilityService) {
      const calculated = await this.availabilityService.computeAvailableSlots(employer.id, dto);
      return {
        startDate: dto.startDate,
        endDate: dto.endDate,
        timezone,
        candidateTimezone: candidateTz,
        slotDurationMinutes: durationMins,
        bufferMinutes: bufferMins,
        totalAvailableSlots: calculated.length,
        slots: calculated,
      };
    }

    const [startH, startM] = (dto.workingHoursStart || '09:00').split(':').map(Number);
    const [endH, endM] = (dto.workingHoursEnd || '17:00').split(':').map(Number);

    const allEmployerInterviews = await this.prisma.client.orm.public.JobInterview
      .where({ employerId: employer.id })
      .all();

    const activeInterviews = allEmployerInterviews.filter((i) =>
      [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED].includes(i.status as any),
    );

    const interviewerIds = dto.interviewerIds || [user.id];
    const availableSlots: any[] = [];

    const currentDay = new Date(startDate.getTime());
    while (currentDay <= endDate) {
      const year = currentDay.getFullYear();
      const month = (currentDay.getMonth() + 1).toString().padStart(2, '0');
      const day = currentDay.getDate().toString().padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const dayStartMinutes = startH * 60 + startM;
      const dayEndMinutes = endH * 60 + endM;

      let currentSlotStartMins = dayStartMinutes;
      while (currentSlotStartMins + durationMins <= dayEndMinutes) {
        const slotEndMins = currentSlotStartMins + durationMins;

        const slotStartHours = Math.floor(currentSlotStartMins / 60).toString().padStart(2, '0');
        const slotStartMinutes = (currentSlotStartMins % 60).toString().padStart(2, '0');
        const slotEndHours = Math.floor(slotEndMins / 60).toString().padStart(2, '0');
        const slotEndMinutes = (slotEndMins % 60).toString().padStart(2, '0');

        const slotStartLocalIso = `${dateString}T${slotStartHours}:${slotStartMinutes}:00`;
        const slotEndLocalIso = `${dateString}T${slotEndHours}:${slotEndMinutes}:00`;

        const offsetMinutes = getTimezoneOffsetMinutes(timezone, new Date(slotStartLocalIso));
        const slotStartUtc = new Date(new Date(slotStartLocalIso).getTime() - offsetMinutes * 60 * 1000);
        const slotEndUtc = new Date(new Date(slotEndLocalIso).getTime() - offsetMinutes * 60 * 1000);

        const slotStartMs = slotStartUtc.getTime();
        const slotEndMs = slotEndUtc.getTime();

        const hasConflict = activeInterviews.some((item) => {
          const itemStartMs = new Date(item.startTime).getTime();
          const itemEndMs = new Date(item.endTime).getTime();
          const overlaps = slotStartMs < itemEndMs && slotEndMs > itemStartMs;
          if (!overlaps) return false;

          if (item.interviewerIds && item.interviewerIds.length > 0) {
            return item.interviewerIds.some((id: string) => interviewerIds.includes(id));
          }
          return true;
        });

        if (!hasConflict && slotStartMs > Date.now()) {
          const slotItem: any = {
            startTimeUtc: slotStartUtc.toISOString(),
            endTimeUtc: slotEndUtc.toISOString(),
            durationMinutes: durationMins,
            employerLocal: getLocalizedTimeDetails(slotStartUtc.toISOString(), timezone),
          };

          if (candidateTz) {
            slotItem.candidateLocal = getLocalizedTimeDetails(slotStartUtc.toISOString(), candidateTz);
          }

          availableSlots.push(slotItem);
        }

        currentSlotStartMins += durationMins + bufferMins;
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }

    return {
      timezone,
      candidateTimezone: candidateTz,
      slotDurationMinutes: durationMins,
      bufferMinutes: bufferMins,
      totalAvailableSlots: availableSlots.length,
      slots: availableSlots,
    };
  }

  /**
   * Aggregated calendar view of scheduled interviews for employer or candidate.
   */
  async getCalendarView(user: AuthUser, dto: CalendarViewDto) {
    const timezone = normalizeTimezone(dto.timezone);
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    const isEmployer = !!employer;
    let interviews: any[] = [];

    if (isEmployer) {
      interviews = (await this.prisma.client.orm.public.JobInterview
        .where({ employerId: employer.id })
        ?.all?.()) || [];
      if (dto.jobId) {
        interviews = interviews.filter((i) => i.jobId === dto.jobId);
      }
      if (dto.interviewerId) {
        interviews = interviews.filter((i) => i.interviewerIds?.includes(dto.interviewerId!));
      }
    } else {
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();
      if (!candidateProfile && user.role !== Role.ADMIN) {
        throw new ForbiddenException('Profile not found for calendar view.');
      }
      if (candidateProfile) {
        interviews = (await this.prisma.client.orm.public.JobInterview
          .where({ candidateId: candidateProfile.id })
          ?.all?.()) || [];
      }
    }

    // Filter by month or date range
    if (dto.month) {
      const [y, m] = dto.month.split('-').map(Number);
      const startMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
      const endMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59));
      interviews = interviews.filter((i) => {
        const ms = new Date(i.startTime).getTime();
        return ms >= startMonth.getTime() && ms <= endMonth.getTime();
      });
    } else {
      if (dto.from) {
        const fromMs = new Date(dto.from).getTime();
        interviews = interviews.filter((i) => new Date(i.startTime).getTime() >= fromMs);
      }
      if (dto.to) {
        const toMs = new Date(dto.to).getTime();
        interviews = interviews.filter((i) => new Date(i.startTime).getTime() <= toMs);
      }
    }

    // Group by localized date (YYYY-MM-DD in the viewer's timezone)
    const groupedDays: Record<string, any[]> = {};

    for (const i of interviews) {
      const local = getLocalizedTimeDetails(i.startTime, timezone);
      const isoDate = new Date(i.startTime).toLocaleDateString('en-CA', { timeZone: timezone });

      if (!groupedDays[isoDate]) {
        groupedDays[isoDate] = [];
      }

      groupedDays[isoDate].push({
        id: i.id,
        title: i.title,
        status: i.status,
        interviewType: i.interviewType,
        startTimeUtc: i.startTime,
        endTimeUtc: i.endTime,
        meetingLink: i.meetingLink,
        location: i.location,
        localTime: local,
        durationMinutes: Math.max(
          1,
          Math.round((new Date(i.endTime).getTime() - new Date(i.startTime).getTime()) / 60000),
        ),
      });
    }

    const sortedDates = Object.keys(groupedDays).sort();
    const days = sortedDates.map((date) => ({
      date,
      count: groupedDays[date].length,
      interviews: groupedDays[date].sort(
        (a, b) => new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime(),
      ),
    }));

    return {
      timezone,
      totalInterviews: interviews.length,
      daysCount: days.length,
      calendar: days,
    };
  }

  /**
   * List interviews for employer or candidate with timeframe filtering.
   */
  async listInterviews(user: AuthUser, query?: QueryInterviewsDto) {
    const isEmployer = user.role === Role.EMPLOYER || user.role === Role.ADMIN;
    let interviews: any[] = [];

    if (isEmployer) {
      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ userId: user.id })
        .first();

      if (employer) {
        interviews = (await this.prisma.client.orm.public.JobInterview
          .where({ employerId: employer.id })
          ?.all?.()) || [];
      } else if (user.role !== Role.ADMIN) {
        throw new ForbiddenException('Employer profile not found.');
      }
    } else {
      // Candidate: Job Seeker
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ userId: user.id })
        .first();

      if (!candidateProfile) {
        throw new ForbiddenException('Job seeker profile not found.');
      }

      interviews = (await this.prisma.client.orm.public.JobInterview
        .where({ candidateId: candidateProfile.id })
        ?.all?.()) || [];
    }

    // Apply filters
    if (query?.jobId) {
      interviews = interviews.filter((i) => i.jobId === query.jobId);
    }
    if (query?.applicationId) {
      interviews = interviews.filter((i) => i.applicationId === query.applicationId);
    }
    if (query?.candidateId) {
      interviews = interviews.filter((i) => i.candidateId === query.candidateId);
    }
    if (query?.status) {
      interviews = interviews.filter((i) => i.status === query.status);
    }
    if (query?.from) {
      const fromMs = new Date(query.from).getTime();
      interviews = interviews.filter((i) => new Date(i.startTime).getTime() >= fromMs);
    }
    if (query?.to) {
      const toMs = new Date(query.to).getTime();
      interviews = interviews.filter((i) => new Date(i.startTime).getTime() <= toMs);
    }

    const now = Date.now();
    if (query?.timeframe === 'upcoming') {
      interviews = interviews.filter(
        (i) =>
          new Date(i.startTime).getTime() >= now &&
          [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED].includes(i.status as any),
      );
    } else if (query?.timeframe === 'past') {
      interviews = interviews.filter(
        (i) =>
          new Date(i.startTime).getTime() < now ||
          [InterviewStatus.COMPLETED, InterviewStatus.CANCELLED, InterviewStatus.NO_SHOW].includes(
            i.status as any,
          ),
      );
    }

    // Sort by startTime
    interviews.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Enrich interview records
    const enrichedList: EnrichedInterview[] = [];
    for (const interview of interviews) {
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: interview.candidateId })
        .first();

      const candidateUser = candidateProfile
        ? await this.prisma.client.orm.public.User
            .where({ id: candidateProfile.userId })
            .first()
        : null;

      const job = await this.prisma.client.orm.public.Job
        .where({ id: interview.jobId })
        .first();

      const enriched = await this.enrichInterviewRecord(
        interview,
        candidateUser,
        candidateProfile,
        job,
        query?.viewerTimezone,
      );
      enrichedList.push(enriched);
    }

    return {
      count: enrichedList.length,
      interviews: enrichedList,
    };
  }

  /**
   * Get single interview by id.
   */
  async getInterviewById(user: AuthUser, id: string, viewerTimezone?: string): Promise<EnrichedInterview> {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();

    const isEmployer = employer && interview.employerId === employer.id;
    const isCandidate = candidateProfile && interview.candidateId === candidateProfile.id;
    const isAdmin = user.role === Role.ADMIN;

    if (!isEmployer && !isCandidate && !isAdmin) {
      throw new ForbiddenException('You do not have permission to view this interview.');
    }

    const fullCandidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ id: interview.candidateId })
      .first();

    const candidateUser = fullCandidateProfile
      ? await this.prisma.client.orm.public.User
          .where({ id: fullCandidateProfile.userId })
          .first()
      : null;

    const job = await this.prisma.client.orm.public.Job
      .where({ id: interview.jobId })
      .first();

    return this.enrichInterviewRecord(
      interview,
      candidateUser,
      fullCandidateProfile,
      job,
      viewerTimezone,
    );
  }

  /**
   * Update or reschedule an existing interview with conflict checks.
   */
  async updateInterview(user: AuthUser, id: string, dto: UpdateInterviewDto) {
    const existing = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!existing) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (existing.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to update this interview.');
    }

    const updateData: any = {};
    if (dto.title) updateData.title = dto.title.trim();
    if (dto.interviewType) updateData.interviewType = dto.interviewType;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.candidateInstructions !== undefined) updateData.candidateInstructions = dto.candidateInstructions;
    if (dto.interviewerIds) updateData.interviewerIds = dto.interviewerIds;
    if (dto.timezone) updateData.timezone = normalizeTimezone(dto.timezone);

    let timesChanged = false;
    const start = dto.startTime ? new Date(dto.startTime) : new Date(existing.startTime);
    const end = dto.endTime ? new Date(dto.endTime) : new Date(existing.endTime);

    if (dto.startTime || dto.endTime) {
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequestException('Invalid startTime or endTime timestamp.');
      }
      if (start >= end) {
        throw new BadRequestException('startTime must be strictly before endTime.');
      }

      // Conflict detection for reschedule
      if (!dto.allowOverlap) {
        const interviewerIds = dto.interviewerIds || [...(existing.interviewerIds || [user.id])];
        const conflictCheck = await this.checkSchedulingConflict(
          start,
          end,
          existing.candidateId,
          interviewerIds,
          id,
        );
        if (conflictCheck.hasConflict) {
          throw new ConflictException({
            message: 'Interview scheduling conflict detected for updated time slot.',
            conflicts: conflictCheck.conflicts,
          });
        }
      }

      updateData.startTime = start.toISOString();
      updateData.endTime = end.toISOString();
      updateData.status = InterviewStatus.RESCHEDULED;
      updateData.rescheduledCount = (existing.rescheduledCount || 0) + 1;
      updateData.rescheduledFrom = existing.startTime;
      updateData.rescheduledReason = dto.notes || 'Rescheduled by employer';
      updateData.reminderSent24h = false;
      updateData.reminderSent1h = false;
      updateData.reminderSent15m = false;
      timesChanged = true;
    }

    if (dto.meetingLink !== undefined) {
      updateData.meetingLink = dto.meetingLink;
    } else if (
      timesChanged &&
      !existing.meetingLink &&
      (dto.interviewType === 'video' || existing.interviewType === 'video')
    ) {
      updateData.meetingLink = await this.createDailyCoRoom(id, end);
    }

    const updated = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update(updateData);

    // Notify candidate if rescheduled
    if (timesChanged && this.notificationsService) {
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: existing.candidateId })
        .first();

      const candidateUser = candidateProfile
        ? await this.prisma.client.orm.public.User
            .where({ id: candidateProfile.userId })
            .first()
        : null;

      const job = await this.prisma.client.orm.public.Job
        .where({ id: existing.jobId })
        .first();

      if (candidateUser) {
        let interviewerEmails: string[] = [];
        if (existing.interviewerIds && existing.interviewerIds.length > 0) {
          try {
            const users = await this.prisma.client.orm.public.User
              .where({ id: [...existing.interviewerIds] as any })
              .all?.();
            interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
          } catch {
            //
          }
        }

        const enriched = await this.getInterviewById(user, id, dto.candidateTimezone);

        if (this.calendarEventsService) {
          try {
            await this.calendarEventsService.syncInterviewCalendarEvent(
              updated,
              employer,
              candidateUser,
              job,
              interviewerEmails,
            );
          } catch (err) {
            this.logger.warn(`Failed to sync calendar event on reschedule #${id}: ${err}`);
          }
        }

        let icsContent: string | null = null;
        try {
          icsContent = this.buildIcsCalendarContent(enriched, 'REQUEST');
        } catch {
          //
        }

        const reschedulePayload = {
          candidateUserId: candidateUser.id,
          candidateEmail: candidateUser.email,
          candidateName: candidateUser.name || 'Candidate',
          employerName: employer.name || 'Fruitful Employer',
          jobTitle: job?.title || 'Job Opportunity',
          interviewId: id,
          interviewTitle: updateData.title || existing.title,
          interviewType: updateData.interviewType || existing.interviewType,
          startTime: updateData.startTime,
          endTime: updateData.endTime,
          timezone: updateData.timezone || existing.timezone,
          candidateTimezone: dto.candidateTimezone,
          meetingLink: updateData.meetingLink || existing.meetingLink,
          location: updateData.location || existing.location,
          candidateInstructions: updateData.candidateInstructions || existing.candidateInstructions,
          interviewerEmails,
          organizerEmail: employer.contactEmail || undefined,
          previousStartTime: existing.startTime,
          icsAttachment: icsContent
            ? {
                filename: `interview-${id.slice(0, 8)}.ics`,
                content: icsContent,
              }
            : undefined,
          isRescheduled: true,
        };

        if (typeof this.notificationsService.sendInterviewRescheduledNotification === 'function') {
          await this.notificationsService.sendInterviewRescheduledNotification(reschedulePayload);
        } else {
          await this.notificationsService.sendInterviewNotification(reschedulePayload);
        }
      }
    }

    if (timesChanged) {
      try {
        await this.prisma.client.orm.public.CandidateNote.create({
          id: randomUUID(),
          employerId: employer.id,
          profileId: existing.candidateId,
          applicationId: existing.applicationId,
          authorId: user.id,
          content: `[Interview Rescheduled]: "${updateData.title || existing.title}" moved from ${existing.startTime} to ${updateData.startTime}. Reason: ${dto.notes || 'Rescheduled by employer'}`,
          category: 'interview_status',
          rating: null,
          isPinned: false,
        });
      } catch {
        // Continue if audit note creation skipped
      }
    }

    return this.getInterviewById(user, id, dto.candidateTimezone);
  }

  /**
   * Dedicated endpoint to reschedule an interview with audit trail and notifications.
   */
  async rescheduleInterview(user: AuthUser, id: string, dto: RescheduleInterviewDto) {
    return this.updateInterview(user, id, {
      startTime: dto.startTime,
      endTime: dto.endTime,
      timezone: dto.timezone,
      candidateTimezone: dto.candidateTimezone,
      interviewerIds: dto.interviewerIds,
      meetingLink: dto.meetingLink,
      location: dto.location,
      notes: dto.reason ? `[Rescheduled]: ${dto.reason}` : dto.notes,
      candidateInstructions: dto.candidateInstructions,
      allowOverlap: dto.allowOverlap,
    });
  }

  /**
   * Cancel an interview.
   */
  async cancelInterview(user: AuthUser, id: string, dto?: CancelInterviewDto) {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (interview.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to cancel this interview.');
    }

    const cancelledAt = new Date().toISOString();
    const cancelledBy = user.role === Role.EMPLOYER ? 'employer' : 'admin';

    await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update({
        status: InterviewStatus.CANCELLED,
        cancellationReason: dto?.cancellationReason || 'Cancelled by employer',
        cancelledBy,
        cancelledAt,
      });

    try {
      await this.prisma.client.orm.public.CandidateNote.create({
        id: randomUUID(),
        employerId: employer.id,
        profileId: interview.candidateId,
        applicationId: interview.applicationId,
        authorId: user.id,
        content: `[Interview Cancelled]: "${interview.title}" scheduled for ${interview.startTime} was cancelled. Reason: ${dto?.cancellationReason || 'Cancelled by employer'}`,
        category: 'interview_status',
        rating: null,
        isPinned: false,
      });
    } catch {
      //
    }

    // Notify candidate
    if (this.notificationsService) {
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: interview.candidateId })
        .first();

      const candidateUser = candidateProfile
        ? await this.prisma.client.orm.public.User
            .where({ id: candidateProfile.userId })
            .first()
        : null;

      const job = await this.prisma.client.orm.public.Job
        .where({ id: interview.jobId })
        .first();

      if (candidateUser) {
        // Gather interviewer emails
        let interviewerEmails: string[] = [];
        if (interview.interviewerIds && interview.interviewerIds.length > 0) {
          try {
            const users = await this.prisma.client.orm.public.User
              .where({ id: [...interview.interviewerIds] as any })
              .all?.();
            interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
          } catch {
            //
          }
        }

        // Cancel calendar event
        if (this.calendarEventsService) {
          try {
            const calEvent = await this.prisma.client.orm.public.CalendarEvent
              .where({ interviewId: id })
              .first?.();
            if (calEvent) {
              await this.calendarEventsService.cancelEvent(user, calEvent.id);
            }
          } catch {
            //
          }
        }

        const enriched = await this.getInterviewById(user, id);
        let cancelIcs: string | null = null;
        try {
          cancelIcs = this.buildIcsCalendarContent(enriched, 'CANCEL');
        } catch {
          //
        }

        await this.notificationsService.sendInterviewCancellationNotification({
          candidateUserId: candidateUser.id,
          candidateEmail: candidateUser.email,
          candidateName: candidateUser.name || 'Candidate',
          employerName: employer.name || 'Fruitful Employer',
          jobTitle: job?.title || 'Job Opportunity',
          interviewTitle: interview.title,
          startTime: interview.startTime,
          cancellationReason: dto?.cancellationReason,
          interviewerEmails,
          organizerEmail: employer.contactEmail || undefined,
          icsAttachment: cancelIcs
            ? {
                filename: `interview-cancelled-${id.slice(0, 8)}.ics`,
                content: cancelIcs,
              }
            : undefined,
        });
      }
    }

    return {
      success: true,
      message: `Interview #${id} has been cancelled.`,
    };
  }

  /**
   * Complete an interview and record rating + feedback.
   */
  async completeInterview(user: AuthUser, id: string, dto: CompleteInterviewDto) {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const employer = await this.getEmployerProfile(user);
    if (interview.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to complete this interview.');
    }

    const updateData: any = {
      status: InterviewStatus.COMPLETED,
    };
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.feedbackSummary !== undefined) updateData.feedbackSummary = dto.feedbackSummary;

    await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update(updateData);

    // Optionally create a structured CandidateNote
    if (dto.createCandidateNote && (dto.feedbackSummary || dto.rating)) {
      await this.prisma.client.orm.public.CandidateNote.create({
        id: randomUUID(),
        employerId: employer.id,
        profileId: interview.candidateId,
        applicationId: interview.applicationId,
        authorId: user.id,
        content: `Post-Interview Feedback (${interview.title}): ${dto.feedbackSummary || 'Evaluation recorded.'}`,
        category: 'technical_interview',
        rating: dto.rating ?? null,
        isPinned: false,
      });
    }

    const updated = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    return updated;
  }

  /**
   * Candidate self-service: Confirm interview attendance.
   */
  async candidateConfirmInterview(user: AuthUser, id: string) {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();

    if (!candidateProfile || (candidateProfile.id !== interview.candidateId && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to confirm this interview.');
    }

    const confirmationNote = `[Candidate Confirmed]: Candidate ${user.name || user.email} confirmed attendance on ${new Date().toISOString()}`;
    const updatedNotes = interview.notes ? `${interview.notes}\n${confirmationNote}` : confirmationNote;

    await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update({ notes: updatedNotes });

    return {
      success: true,
      message: 'Interview attendance successfully confirmed.',
    };
  }

  /**
   * Candidate self-service: Request rescheduling.
   */
  async candidateRequestReschedule(user: AuthUser, id: string, dto: CandidateRescheduleRequestDto) {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();

    if (!candidateProfile || (candidateProfile.id !== interview.candidateId && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to request rescheduling for this interview.');
    }

    const rescheduleNote = `[Candidate Reschedule Request]: Reason: ${dto.reason}. Proposed Time 1: ${dto.proposedTime1}${
      dto.proposedTime2 ? `, Proposed Time 2: ${dto.proposedTime2}` : ''
    } (Candidate TZ: ${dto.candidateTimezone || 'Not specified'})`;

    const updatedNotes = interview.notes ? `${interview.notes}\n${rescheduleNote}` : rescheduleNote;

    await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update({ notes: updatedNotes });

    this.logger.log(`Candidate #${candidateProfile.id} requested reschedule for interview #${id}`);

    return {
      success: true,
      message: 'Reschedule request submitted to the hiring team.',
      rescheduleRequest: {
        reason: dto.reason,
        proposedTime1: dto.proposedTime1,
        proposedTime2: dto.proposedTime2,
      },
    };
  }

  /**
   * Candidate self-service: directly reschedule interview to a new available slot.
   */
  async candidateRescheduleInterview(user: AuthUser, id: string, dto: CandidateDirectRescheduleDto) {
    const existing = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!existing) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();

    if (!candidateProfile || (candidateProfile.id !== existing.candidateId && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to reschedule this interview.');
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startTime or endTime ISO timestamp.');
    }
    if (start >= end) {
      throw new BadRequestException('startTime must be strictly before endTime.');
    }

    const conflictCheck = await this.checkSchedulingConflict(
      start,
      end,
      candidateProfile.id,
      [...(existing.interviewerIds || [])],
      id,
    );
    if (conflictCheck.hasConflict) {
      throw new ConflictException({
        message: 'The requested time slot has a scheduling conflict.',
        conflicts: conflictCheck.conflicts,
      });
    }

    const updated = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update({
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: InterviewStatus.RESCHEDULED,
        rescheduledCount: (existing.rescheduledCount || 0) + 1,
        rescheduledFrom: existing.startTime,
        rescheduledReason: dto.reason || 'Candidate selected new time slot',
        cancelledBy: null,
        reminderSent24h: false,
        reminderSent1h: false,
        reminderSent15m: false,
      });

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: existing.employerId })
      .first();
    const candidateUser = await this.prisma.client.orm.public.User
      .where({ id: candidateProfile.userId })
      .first();
    const job = await this.prisma.client.orm.public.Job
      .where({ id: existing.jobId })
      .first();

    let interviewerEmails: string[] = [];
    if (existing.interviewerIds && existing.interviewerIds.length > 0) {
      try {
        const users = await this.prisma.client.orm.public.User
          .where({ id: [...existing.interviewerIds] as any })
          ?.all?.();
        interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
      } catch {
        // Continue
      }
    }

    const updatedEntity = {
      ...existing,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: InterviewStatus.RESCHEDULED,
      rescheduledCount: (existing.rescheduledCount || 0) + 1,
      rescheduledFrom: existing.startTime,
      rescheduledReason: dto.reason || 'Candidate selected new time slot',
      cancelledBy: null,
      reminderSent24h: false,
      reminderSent1h: false,
      reminderSent15m: false,
      ...(typeof updated === 'object' && updated && 'startTime' in updated ? updated : {}),
    };

    if (this.calendarEventsService && employer && candidateUser && job) {
      try {
        await this.calendarEventsService.syncInterviewCalendarEvent(
          updatedEntity,
          employer,
          candidateUser,
          job,
          interviewerEmails,
        );
      } catch (err) {
        this.logger.warn(`Failed to sync calendar event on candidate reschedule: ${err}`);
      }
    }

    const enriched = await this.enrichInterviewRecord(
      updatedEntity,
      candidateUser,
      candidateProfile,
      job,
      dto.candidateTimezone,
    );

    let icsContent: string | null = null;
    try {
      icsContent = this.buildIcsCalendarContent(enriched, 'REQUEST');
    } catch {
      //
    }

    if (this.notificationsService && candidateUser && employer) {
      const payload = {
        candidateUserId: candidateUser.id,
        candidateEmail: candidateUser.email,
        candidateName: candidateUser.name || 'Candidate',
        employerName: employer.name || 'Fruitful Employer',
        jobTitle: job?.title || 'Job Opportunity',
        interviewId: id,
        interviewTitle: existing.title,
        interviewType: existing.interviewType,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        timezone: existing.timezone,
        candidateTimezone: dto.candidateTimezone,
        meetingLink: existing.meetingLink,
        location: existing.location,
        candidateInstructions: existing.candidateInstructions,
        interviewerEmails,
        organizerEmail: employer.contactEmail || undefined,
        previousStartTime: existing.startTime,
        icsAttachment: icsContent
          ? {
              filename: `interview-${id.slice(0, 8)}.ics`,
              content: icsContent,
            }
          : undefined,
        isRescheduled: true,
      };

      if (typeof this.notificationsService.sendInterviewRescheduledNotification === 'function') {
        await this.notificationsService.sendInterviewRescheduledNotification(payload);
      } else {
        await this.notificationsService.sendInterviewNotification(payload);
      }
    }

    return enriched;
  }

  /**
   * Candidate self-service: cancel interview.
   */
  async candidateCancelInterview(user: AuthUser, id: string, dto: CandidateCancelInterviewDto) {
    const existing = await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .first();

    if (!existing) {
      throw new NotFoundException(`Interview #${id} not found.`);
    }

    const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
      .where({ userId: user.id })
      .first();

    if (!candidateProfile || (candidateProfile.id !== existing.candidateId && user.role !== Role.ADMIN)) {
      throw new ForbiddenException('You do not have permission to cancel this interview.');
    }

    const cancelledAt = new Date().toISOString();
    await this.prisma.client.orm.public.JobInterview
      .where({ id })
      .update({
        status: InterviewStatus.CANCELLED,
        cancellationReason: dto.reason || 'Cancelled by candidate',
        cancelledBy: 'candidate',
        cancelledAt,
      });

    if (this.calendarEventsService) {
      try {
        const calEvent = await this.prisma.client.orm.public.CalendarEvent
          .where({ interviewId: id })
          .first?.();
        if (calEvent) {
          await this.calendarEventsService.cancelEvent(user, calEvent.id);
        }
      } catch {
        //
      }
    }

    const candidateUser = await this.prisma.client.orm.public.User
      .where({ id: candidateProfile.userId })
      .first();
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ id: existing.employerId })
      .first();
    const job = await this.prisma.client.orm.public.Job
      .where({ id: existing.jobId })
      .first();

    let interviewerEmails: string[] = [];
    if (existing.interviewerIds && existing.interviewerIds.length > 0) {
      try {
        const users = await this.prisma.client.orm.public.User
          .where({ id: [...existing.interviewerIds] as any })
          ?.all?.();
        interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
      } catch {
        //
      }
    }

    if (this.notificationsService && candidateUser && employer) {
      const enriched = await this.enrichInterviewRecord(
        existing,
        candidateUser,
        candidateProfile,
        job,
      );
      let cancelIcs: string | null = null;
      try {
        cancelIcs = this.buildIcsCalendarContent(enriched, 'CANCEL');
      } catch {
        //
      }

      await this.notificationsService.sendInterviewCancellationNotification({
        candidateUserId: candidateUser.id,
        candidateEmail: candidateUser.email,
        candidateName: candidateUser.name || 'Candidate',
        employerName: employer.name || 'Fruitful Employer',
        jobTitle: job?.title || 'Job Opportunity',
        interviewTitle: existing.title,
        startTime: existing.startTime,
        cancellationReason: dto.reason || 'Cancelled by candidate',
        interviewerEmails,
        organizerEmail: employer.contactEmail || undefined,
        icsAttachment: cancelIcs
          ? {
              filename: `interview-cancelled-${id.slice(0, 8)}.ics`,
              content: cancelIcs,
            }
          : undefined,
      });
    }

    return {
      success: true,
      message: `Interview #${id} has been cancelled by candidate.`,
    };
  }

  /**
   * Generate 1-click web calendar links for Google, Outlook, Yahoo, and iCalendar.
   */
  async getCalendarLinks(user: AuthUser, id: string) {
    const enriched = await this.getInterviewById(user, id);

    return {
      interviewId: enriched.id,
      title: enriched.title,
      startTime: enriched.startTime,
      endTime: enriched.endTime,
      timezone: enriched.timezone,
      durationMinutes: enriched.durationMinutes,
      localTime: enriched.localTime,
      links: enriched.calendarLinks,
    };
  }

  /**
   * Generate an iCalendar (.ics) invite string for an interview with alarms and timezones.
   */
  /**
   * Build compliant RFC 5545 iCalendar content for an interview.
   */
  buildIcsCalendarContent(enriched: EnrichedInterview, method: 'REQUEST' | 'CANCEL' = 'REQUEST'): string {
    const formatIcsDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const dtStart = formatIcsDate(enriched.startTime);
    const dtEnd = formatIcsDate(enriched.endTime);
    const now = formatIcsDate(new Date().toISOString());

    const summary = `${enriched.title}: ${enriched.candidate?.name || 'Candidate'} - ${enriched.job?.title || 'Job'}`;
    const description = [
      `Fruitful Journey ATS Interview`,
      `Interview Type: ${enriched.interviewType}`,
      `Meeting Link: ${enriched.meetingLink || 'N/A'}`,
      `Candidate: ${enriched.candidate?.name || 'N/A'} (${enriched.candidate?.email || 'N/A'})`,
      `Job Title: ${enriched.job?.title || 'N/A'}`,
      `Timezone: ${enriched.timezone || 'UTC'}`,
      enriched.candidateInstructions ? `Instructions: ${enriched.candidateInstructions}` : '',
      method === 'CANCEL' ? `Cancellation reason: ${enriched.cancellationReason || 'Cancelled by employer'}` : '',
    ]
      .filter(Boolean)
      .join('\\n');

    const location = enriched.meetingLink || enriched.location || 'Online Video Meeting';
    const candidateName = enriched.candidate?.name || 'Candidate';
    const candidateEmail = enriched.candidate?.email || 'candidate@example.com';
    const companyName = enriched.job?.companyName || 'Fruitful Journey';
    const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
    const sequence = method === 'CANCEL' ? '1' : '0';

    let attendeeLines = `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${candidateName}":mailto:${candidateEmail}`;
    if (enriched.interviewers && enriched.interviewers.length > 0) {
      for (const interviewer of enriched.interviewers) {
        if (interviewer.email && interviewer.email !== candidateEmail) {
          attendeeLines += `\r\nATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${interviewer.name || 'Interviewer'}":mailto:${interviewer.email}`;
        }
      }
    }

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Fruitful Journey//ATS Calendar//EN',
      'CALSCALE:GREGORIAN',
      `METHOD:${method}`,
      `X-WR-TIMEZONE:${enriched.timezone || 'UTC'}`,
      'BEGIN:VEVENT',
      `UID:${enriched.id}@fruitfuljourney.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      `ORGANIZER;CN="${companyName}":mailto:recruiting@fruitfuljourney.com`,
      attendeeLines,
      `STATUS:${status}`,
      `SEQUENCE:${sequence}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: Interview in 24 hours with ${companyName}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: Interview in 1 hour with ${companyName}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /**
   * Generate an iCalendar (.ics) invite string for an interview with alarms and timezones.
   */
  async getIcsCalendarInvite(user: AuthUser, id: string): Promise<string> {
    const enriched = await this.getInterviewById(user, id);
    return this.buildIcsCalendarContent(
      enriched,
      enriched.status === InterviewStatus.CANCELLED ? 'CANCEL' : 'REQUEST',
    );
  }

  /**
   * Manually dispatch / resend rich email invitation with calendar (.ics) attachment.
   */
  async resendInvitationEmail(
    user: AuthUser,
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const enriched = await this.getInterviewById(user, id);
    if (!enriched.candidate?.email) {
      throw new BadRequestException('Candidate email is not available for this interview.');
    }

    const icsContent = this.buildIcsCalendarContent(
      enriched,
      enriched.status === InterviewStatus.CANCELLED ? 'CANCEL' : 'REQUEST',
    );
    const interviewerEmails = (enriched.interviewers || []).map((i) => i.email).filter(Boolean);

    if (this.notificationsService) {
      await this.notificationsService.sendInterviewNotification({
        candidateUserId: enriched.candidate.userId,
        candidateEmail: enriched.candidate.email,
        candidateName: enriched.candidate.name || 'Candidate',
        employerName: enriched.job?.companyName || 'Fruitful Employer',
        jobTitle: enriched.job?.title || 'Job Opportunity',
        interviewId: enriched.id,
        interviewTitle: enriched.title,
        interviewType: enriched.interviewType,
        startTime: enriched.startTime,
        endTime: enriched.endTime,
        timezone: enriched.timezone,
        candidateTimezone: enriched.candidateLocalTime?.timezone,
        meetingLink: enriched.meetingLink,
        location: enriched.location,
        candidateInstructions: enriched.candidateInstructions,
        interviewerEmails,
        organizerEmail: undefined,
        icsAttachment: {
          filename: `interview-${enriched.id.slice(0, 8)}.ics`,
          content: icsContent,
        },
      });
    }

    return {
      success: true,
      message: `Interview invitation email dispatched to ${enriched.candidate.email} with calendar attachment.`,
    };
  }

  /**
   * Get supported IANA timezones grouped by region.
   */
  getTimezoneList() {
    return {
      count: SUPPORTED_TIMEZONES.length,
      timezones: SUPPORTED_TIMEZONES,
    };
  }

  /**
   * Convert timestamp across timezones.
   */
  convertTimezone(dto: ConvertTimezoneDto) {
    if (!dto.timestamp || isNaN(new Date(dto.timestamp).getTime())) {
      throw new BadRequestException('Invalid timestamp ISO string.');
    }
    return convertTimestamp(dto.timestamp, dto.fromTimezone || 'UTC', dto.toTimezone);
  }

  /**
   * Manually dispatch an interview reminder.
   */
  async sendInterviewReminder(user: AuthUser, id: string) {
    const interview = await this.getInterviewById(user, id);

    if (interview.candidate && this.notificationsService) {
      await this.notificationsService.sendInterviewNotification({
        candidateUserId: interview.candidate.userId,
        candidateEmail: interview.candidate.email,
        candidateName: interview.candidate.name || 'Candidate',
        employerName: interview.job?.companyName || 'Employer',
        jobTitle: interview.job?.title || 'Job Position',
        interviewId: interview.id,
        interviewTitle: interview.title,
        interviewType: interview.interviewType,
        startTime: interview.startTime,
        endTime: interview.endTime,
        timezone: interview.timezone,
        meetingLink: interview.meetingLink,
        location: interview.location,
        candidateInstructions: interview.candidateInstructions,
        isReminder: true,
        reminderType: '24h',
      });
    }

    return {
      success: true,
      message: 'Interview reminder dispatched.',
    };
  }

  /**
   * Check upcoming interviews and trigger automated 24h, 1h, and 15m reminders.
   */
  async triggerDueReminders(dto?: ProcessRemindersDto): Promise<{
    processed24h: number;
    processed1h: number;
    processed15m?: number;
    totalProcessed?: number;
  }> {
    if (this.remindersService) {
      return this.remindersService.triggerDueReminders(dto);
    }

    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const in1h = now + 60 * 60 * 1000;

    let scheduled: any[] = [];
    try {
      scheduled = (await this.prisma.client.orm.public.JobInterview
        .where({ status: InterviewStatus.SCHEDULED })
        ?.all?.()) || [];
    } catch {
      scheduled = [];
    }

    let count24h = 0;
    let count1h = 0;

    for (const interview of scheduled) {
      const startTimeMs = new Date(interview.startTime).getTime();

      // 1-hour reminder window: between now and in 60 minutes
      if (startTimeMs > now && startTimeMs <= in1h && !interview.reminderSent1h) {
        await this.dispatchReminder(interview, '1h');
        await this.prisma.client.orm.public.JobInterview
          .where({ id: interview.id })
          .update({ reminderSent1h: true });
        count1h++;
      }
      // 24-hour reminder window: between in1h and in 24 hours
      else if (startTimeMs > in1h && startTimeMs <= in24h && !interview.reminderSent24h) {
        await this.dispatchReminder(interview, '24h');
        await this.prisma.client.orm.public.JobInterview
          .where({ id: interview.id })
          .update({ reminderSent24h: true });
        count24h++;
      }
    }

    this.logger.log(`Triggered interview reminders: 24h=${count24h}, 1h=${count1h}`);
    return {
      processed24h: count24h,
      processed1h: count1h,
      processed15m: 0,
      totalProcessed: count24h + count1h,
    };
  }

  /**
   * Preview upcoming interviews due for reminders within a lookahead window.
   */
  async getDueReminders(user: AuthUser, lookaheadMinutes?: number) {
    if (this.remindersService) {
      return this.remindersService.getDueReminders(user, lookaheadMinutes);
    }
    return [];
  }

  /**
   * Send an on-demand reminder for an interview.
   */
  async sendManualReminder(user: AuthUser, id: string, dto: SendManualReminderDto) {
    if (this.remindersService) {
      return this.remindersService.sendManualReminder(user, id, dto);
    }
    return this.sendInterviewReminder(user, id);
  }

  private async dispatchReminder(interview: any, type: '24h' | '1h') {
    if (!this.notificationsService) return;

    try {
      const candidateProfile = await this.prisma.client.orm.public.JobSeekerProfile
        .where({ id: interview.candidateId })
        .first();

      if (!candidateProfile) return;

      const candidateUser = await this.prisma.client.orm.public.User
        .where({ id: candidateProfile.userId })
        .first();

      const job = await this.prisma.client.orm.public.Job
        .where({ id: interview.jobId })
        .first();

      const employer = await this.prisma.client.orm.public.EmployerProfile
        .where({ id: interview.employerId })
        .first();

      if (candidateUser) {
        await this.notificationsService.sendInterviewNotification({
          candidateUserId: candidateUser.id,
          candidateEmail: candidateUser.email,
          candidateName: candidateUser.name || 'Candidate',
          employerName: employer?.name || 'Fruitful Employer',
          jobTitle: job?.title || 'Job Opportunity',
          interviewId: interview.id,
          interviewTitle: interview.title,
          interviewType: interview.interviewType,
          startTime: interview.startTime,
          endTime: interview.endTime,
          timezone: interview.timezone,
          meetingLink: interview.meetingLink,
          location: interview.location,
          candidateInstructions: interview.candidateInstructions,
          isReminder: true,
          reminderType: type,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch automated reminder for interview #${interview.id}: ${err?.message || err}`);
    }
  }

  private async enrichInterviewRecord(
    interview: any,
    candidateUser: any,
    candidateProfile: any,
    job: any,
    viewerTimezone?: string,
  ): Promise<EnrichedInterview> {
    const interviewerIds = interview.interviewerIds || [];
    const interviewers = [];

    for (const uId of interviewerIds) {
      const u = await this.prisma.client.orm.public.User
        .where({ id: uId })
        .first();
      if (u) {
        interviewers.push({
          id: u.id,
          name: u.name,
          email: u.email,
        });
      }
    }

    const durationMinutes = Math.max(
      1,
      Math.round(
        (new Date(interview.endTime).getTime() - new Date(interview.startTime).getTime()) /
          (1000 * 60),
      ),
    );

    const localTime = getLocalizedTimeDetails(interview.startTime, interview.timezone || 'UTC');
    const targetViewerTz = viewerTimezone && isValidTimezone(viewerTimezone) ? viewerTimezone : null;
    const candidateLocalTime = targetViewerTz
      ? getLocalizedTimeDetails(interview.startTime, targetViewerTz)
      : undefined;

    const calendarLinks = {
      google: this.buildGoogleCalendarUrl(interview, candidateUser, job),
      outlook: this.buildOutlookCalendarUrl(interview, candidateUser, job),
      yahoo: this.buildYahooCalendarUrl(interview, candidateUser, job),
      ics: `/api/v1/interviews/${interview.id}/ics`,
    };

    return {
      ...interview,
      interviewerIds: [...interviewerIds],
      durationMinutes,
      localTime,
      candidateLocalTime,
      candidate: candidateProfile
        ? {
            id: candidateProfile.id,
            userId: candidateProfile.userId,
            name: candidateUser?.name || null,
            email: candidateUser?.email || '',
            headline: candidateProfile.headline || null,
            photoUrl: candidateProfile.photoUrl || null,
          }
        : undefined,
      job: job
        ? {
            id: job.id,
            title: job.title,
            companyName: job.companyName || 'Fruitful Journey',
          }
        : undefined,
      interviewers,
      googleCalendarUrl: calendarLinks.google,
      calendarLinks,
    };
  }

  /**
   * Automatically generate a Daily.co video room via REST API if DAILY_API_KEY is configured.
   */
  private async createDailyCoRoom(interviewId: string, endTime: Date): Promise<string | null> {
    const apiKey =
      process.env.DAILY_API_KEY ||
      process.env.DAILY_CO_API_KEY ||
      process.env.MEETING_PROVIDER_API_KEY;

    const domain = process.env.DAILY_DOMAIN;

    if (!apiKey) {
      if (domain) {
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `https://${cleanDomain}/interview-${interviewId.slice(0, 8)}`;
      }
      return null;
    }

    try {
      const expTimestamp = Math.floor(endTime.getTime() / 1000) + 7200;
      const roomName = `fruitful-${interviewId.slice(0, 8)}-${Date.now().toString(36)}`;

      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'public',
          properties: {
            exp: expTimestamp,
            enable_chat: true,
            enable_screenshare: true,
          },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data.url) {
          this.logger.log(`Created Daily.co video meeting room: ${data.url}`);
          return data.url;
        }
      } else {
        const errText = await res.text();
        this.logger.warn(`Daily.co API error (${res.status}): ${errText}`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to generate Daily.co video room: ${err?.message || err}`);
    }

    return null;
  }

  /**
   * Build 1-click Google Calendar web event creation URL with timezone support.
   */
  private buildGoogleCalendarUrl(interview: any, candidateUser: any, job: any): string {
    const formatGoogleDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const startFormatted = formatGoogleDate(interview.startTime);
    const endFormatted = formatGoogleDate(interview.endTime);

    const summary = `${interview.title}: ${candidateUser?.name || 'Candidate'} - ${job?.title || 'Job'}`;
    const description = [
      `Fruitful Journey ATS Interview`,
      `Interview Type: ${interview.interviewType}`,
      `Meeting Link: ${interview.meetingLink || 'N/A'}`,
      `Candidate: ${candidateUser?.name || 'N/A'} (${candidateUser?.email || 'N/A'})`,
      `Job Title: ${job?.title || 'N/A'}`,
      `Company: ${job?.companyName || 'Fruitful Employer'}`,
      `Timezone: ${interview.timezone || 'UTC'}`,
      interview.candidateInstructions ? `\nInstructions: ${interview.candidateInstructions}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const location = interview.meetingLink || interview.location || 'Online Video Meeting';

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: summary,
      dates: `${startFormatted}/${endFormatted}`,
      details: description,
      location,
      ctz: interview.timezone || 'UTC',
    });

    if (candidateUser?.email) {
      params.append('add', candidateUser.email);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /**
   * Build 1-click Outlook.com / Office 365 calendar event creation URL.
   */
  private buildOutlookCalendarUrl(interview: any, candidateUser: any, job: any): string {
    const summary = `${interview.title}: ${candidateUser?.name || 'Candidate'} - ${job?.title || 'Job'}`;
    const description = `Fruitful Journey ATS Interview\nFormat: ${interview.interviewType}\nMeeting Link: ${interview.meetingLink || 'N/A'}\nInstructions: ${interview.candidateInstructions || 'N/A'}`;
    const location = interview.meetingLink || interview.location || 'Online Video Meeting';

    const params = new URLSearchParams({
      subject: summary,
      body: description,
      startdt: new Date(interview.startTime).toISOString(),
      enddt: new Date(interview.endTime).toISOString(),
      location,
    });

    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  /**
   * Build 1-click Yahoo Calendar event creation URL.
   */
  private buildYahooCalendarUrl(interview: any, candidateUser: any, job: any): string {
    const formatYahooDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const summary = `${interview.title}: ${candidateUser?.name || 'Candidate'} - ${job?.title || 'Job'}`;
    const description = `Fruitful Journey ATS Interview\nFormat: ${interview.interviewType}\nMeeting Link: ${interview.meetingLink || 'N/A'}\nInstructions: ${interview.candidateInstructions || 'N/A'}`;
    const location = interview.meetingLink || interview.location || 'Online Video Meeting';

    const params = new URLSearchParams({
      v: '60',
      title: summary,
      desc: description,
      st: formatYahooDate(interview.startTime),
      et: formatYahooDate(interview.endTime),
      in_loc: location,
    });

    return `https://calendar.yahoo.com/?${params.toString()}`;
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
