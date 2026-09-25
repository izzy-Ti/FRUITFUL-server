import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Header,
  Res,
  Optional,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/guards/auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { InterviewsService } from './interviews.service.js';
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
} from './dto/index.js';
import {
  SetAvailabilityDto,
  DateOverrideDto,
} from './dto/availability.dto.js';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  QueryCalendarEventsDto,
} from './dto/calendar-event.dto.js';
import {
  CalendarProvider,
  ConnectCalendarIntegrationDto,
  GenerateOAuthUrlDto,
  CalendarOAuthCallbackDto,
  UpdateCalendarIntegrationDto,
} from './dto/calendar-integration.dto.js';
import { CalendarIntegrationsService } from './calendar-sync/calendar-integrations.service.js';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class InterviewsController {
  constructor(
    private readonly interviewsService: InterviewsService,
    @Optional()
    private readonly availabilityService?: AvailabilityService,
    @Optional()
    private readonly calendarEventsService?: CalendarEventsService,
    @Optional()
    private readonly calendarIntegrationsService?: CalendarIntegrationsService,
  ) {}

  /**
   * Schedule a new interview for a candidate application.
   */
  @Post('employers/interviews')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async scheduleInterview(
    @CurrentUser() user: AuthUser,
    @Body() dto: ScheduleInterviewDto,
  ) {
    return this.interviewsService.scheduleInterview(user, dto);
  }

  /**
   * Check for scheduling conflicts for candidate or interviewers.
   */
  @Post('employers/interviews/check-conflicts')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async checkConflicts(
    @CurrentUser() user: AuthUser,
    @Body() dto: CheckConflictDto,
  ) {
    return this.interviewsService.checkConflicts(user, dto);
  }

  /**
   * Find available open interview slots across a date range.
   */
  @Post(['employers/interviews/availability-slots', 'employers/interviews/availability'])
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getAvailabilitySlots(
    @CurrentUser() user: AuthUser,
    @Body() dto: AvailabilitySlotsDto,
  ) {
    return this.interviewsService.getAvailabilitySlots(user, dto);
  }

  /**
   * Aggregated calendar view of scheduled interviews grouped by day.
   */
  @Get('employers/interviews/calendar')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  async getCalendarView(
    @CurrentUser() user: AuthUser,
    @Query() query: CalendarViewDto,
  ) {
    return this.interviewsService.getCalendarView(user, query);
  }

  /**
   * List interviews for the employer.
   */
  @Get('employers/interviews')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async listEmployerInterviews(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryInterviewsDto,
  ) {
    return this.interviewsService.listInterviews(user, query);
  }

  /**
   * List interviews for candidate (job seeker).
   */
  @Get('job-seekers/interviews')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async listCandidateInterviews(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryInterviewsDto,
  ) {
    return this.interviewsService.listInterviews(user, query);
  }

  /**
   * Get supported IANA timezones grouped by continent/region.
   */
  @Get('interviews/timezones')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  getTimezones() {
    return this.interviewsService.getTimezoneList();
  }

  /**
   * Convert timestamp across timezones.
   */
  @Post('interviews/timezones/convert')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  convertTimezone(@Body() dto: ConvertTimezoneDto) {
    return this.interviewsService.convertTimezone(dto);
  }

  /**
   * Get 1-click calendar links for Google, Outlook, Yahoo, and iCal.
   */
  @Get('interviews/:id/calendar-links')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  async getCalendarLinks(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.interviewsService.getCalendarLinks(user, id);
  }

  /**
   * Candidate confirms interview attendance.
   */
  @Post('interviews/:id/confirm')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async candidateConfirm(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.interviewsService.candidateConfirmInterview(user, id);
  }

  /**
   * Candidate requests interview rescheduling.
   */
  @Post('interviews/:id/reschedule-request')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async candidateRescheduleRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidateRescheduleRequestDto,
  ) {
    return this.interviewsService.candidateRequestReschedule(user, id, dto);
  }

  /**
   * Candidate self-service: directly reschedule interview to a new available slot.
   */
  @Post('interviews/:id/candidate-reschedule')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async candidateDirectReschedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidateDirectRescheduleDto,
  ) {
    return this.interviewsService.candidateRescheduleInterview(user, id, dto);
  }

  /**
   * Candidate self-service: cancel interview.
   */
  @Post('interviews/:id/candidate-cancel')
  @Roles(Role.JOB_SEEKER, Role.ADMIN)
  async candidateCancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CandidateCancelInterviewDto,
  ) {
    return this.interviewsService.candidateCancelInterview(user, id, dto);
  }

  /**
   * Get enriched interview details by ID.
   */
  @Get('interviews/:id')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  async getInterviewById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('viewerTimezone') viewerTimezone?: string,
  ) {
    return this.interviewsService.getInterviewById(user, id, viewerTimezone);
  }

  /**
   * Update or reschedule an existing interview.
   */
  @Patch('employers/interviews/:id')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    return this.interviewsService.updateInterview(user, id, dto);
  }

  /**
   * Dedicated endpoint to reschedule an interview.
   */
  @Post('employers/interviews/:id/reschedule')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async rescheduleInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RescheduleInterviewDto,
  ) {
    return this.interviewsService.rescheduleInterview(user, id, dto);
  }

  /**
   * Cancel an interview.
   */
  @Post('employers/interviews/:id/cancel')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async cancelInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelInterviewDto,
  ) {
    return this.interviewsService.cancelInterview(user, id, dto);
  }

  /**
   * Complete an interview and record candidate rating.
   */
  @Post('employers/interviews/:id/complete')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async completeInterview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteInterviewDto,
  ) {
    return this.interviewsService.completeInterview(user, id, dto);
  }

  /**
   * Download iCalendar (.ics) invite file with alarms and timezone definitions.
   */
  @Get('interviews/:id/ics')
  @Roles(Role.EMPLOYER, Role.JOB_SEEKER, Role.ADMIN)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async downloadIcsCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const icsContent = await this.interviewsService.getIcsCalendarInvite(user, id);
    res.setHeader('Content-Disposition', `attachment; filename="interview-${id}.ics"`);
    res.send(icsContent);
  }

  /**
   * Manually dispatch interview reminder to candidate.
   */
  @Post('employers/interviews/:id/remind')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async sendInterviewReminder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.interviewsService.sendInterviewReminder(user, id);
  }

  /**
   * System/Cron: Check and trigger due 24h and 1h interview reminders.
   */
  @Post('admin/interviews/trigger-reminders')
  @Roles(Role.ADMIN)
  async triggerRemindersBatch() {
    return this.interviewsService.triggerDueReminders();
  }

  /**
   * Manually dispatch / resend rich email invitation with calendar (.ics) attachment.
   */
  @Post('interviews/:id/send-invitation')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async resendInterviewInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.interviewsService.resendInvitationEmail(user, id);
  }

  // ==========================================
  // AVAILABILITY MANAGEMENT ENDPOINTS
  // ==========================================

  /**
   * Get active availability profile for employer.
   */
  @Get('employers/availability')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getAvailabilityProfile(@CurrentUser() user: AuthUser) {
    if (!this.availabilityService) return null;
    return this.availabilityService.getAvailabilityProfile(user);
  }

  /**
   * Set or update weekly availability schedule & parameters for employer.
   */
  @Put('employers/availability')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async setAvailabilityProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetAvailabilityDto,
  ) {
    if (!this.availabilityService) return null;
    return this.availabilityService.setAvailabilityProfile(user, dto);
  }

  /**
   * Add or update a specific date override (blackout date or custom hours).
   */
  @Post('employers/availability/date-overrides')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async addDateOverride(
    @CurrentUser() user: AuthUser,
    @Body() dto: DateOverrideDto,
    @Query('interviewerId') interviewerId?: string,
  ) {
    if (!this.availabilityService) return null;
    return this.availabilityService.addDateOverride(user, dto, interviewerId);
  }

  /**
   * Remove a specific date override.
   */
  @Delete('employers/availability/date-overrides/:date')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async removeDateOverride(
    @CurrentUser() user: AuthUser,
    @Param('date') date: string,
    @Query('interviewerId') interviewerId?: string,
  ) {
    if (!this.availabilityService) return null;
    return this.availabilityService.removeDateOverride(user, date, interviewerId);
  }

  /**
   * Get availability schedule for a specific interviewer.
   */
  @Get('employers/availability/interviewers/:interviewerId')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getInterviewerAvailability(
    @CurrentUser() user: AuthUser,
    @Param('interviewerId') interviewerId: string,
  ) {
    if (!this.availabilityService) return null;
    return this.availabilityService.getAvailabilityProfile(user, interviewerId);
  }

  // ==========================================
  // CALENDAR EVENTS MANAGEMENT ENDPOINTS
  // ==========================================

  /**
   * List all calendar events across date range.
   */
  @Get('employers/calendar/events')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async listCalendarEvents(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCalendarEventsDto,
  ) {
    if (!this.calendarEventsService) return [];
    return this.calendarEventsService.getEvents(user, query);
  }

  /**
   * Create an ad-hoc calendar event or interview session.
   */
  @Post('employers/calendar/events')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async createCalendarEvent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCalendarEventDto,
  ) {
    if (!this.calendarEventsService) return null;
    return this.calendarEventsService.createEvent(user, dto);
  }

  /**
   * Get a single calendar event by ID.
   */
  @Get('employers/calendar/events/:id')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getCalendarEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    if (!this.calendarEventsService) return null;
    return this.calendarEventsService.getEventById(user, id);
  }

  /**
   * Update an existing calendar event.
   */
  @Patch('employers/calendar/events/:id')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateCalendarEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    if (!this.calendarEventsService) return null;
    return this.calendarEventsService.updateEvent(user, id, dto);
  }

  /**
   * Cancel a calendar event.
   */
  @Delete('employers/calendar/events/:id')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async cancelCalendarEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    if (!this.calendarEventsService) return null;
    return this.calendarEventsService.cancelEvent(user, id);
  }

  /**
   * Download iCalendar (.ics) file for a calendar event.
   */
  @Get('employers/calendar/events/:id/ics')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async downloadCalendarEventIcs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    if (!this.calendarEventsService) {
      res.status(404).send('Service unavailable');
      return;
    }
    const event = await this.calendarEventsService.getEventById(user, id);
    const icsContent = this.calendarEventsService.generateIcsForEvent(
      event,
      event.status === 'cancelled' ? 'CANCEL' : 'REQUEST',
    );
    res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
    res.send(icsContent);
  }

  // ==========================================
  // AUTOMATED & MANUAL REMINDERS
  // ==========================================

  /**
   * Process automated interview reminders (24h, 1h, 15m).
   */
  @Post('employers/interviews/reminders/process')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async processReminders(@Body() dto?: ProcessRemindersDto) {
    return this.interviewsService.triggerDueReminders(dto);
  }

  /**
   * Preview upcoming interviews due for reminders.
   */
  @Get('employers/interviews/reminders/due')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getDueReminders(
    @CurrentUser() user: AuthUser,
    @Query('lookaheadMinutes') lookaheadMinutes?: number,
  ) {
    return this.interviewsService.getDueReminders(
      user,
      lookaheadMinutes ? Number(lookaheadMinutes) : undefined,
    );
  }

  /**
   * Send an on-demand reminder for a specific interview.
   */
  @Post('employers/interviews/:id/reminders')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async sendManualReminder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendManualReminderDto,
  ) {
    return this.interviewsService.sendManualReminder(user, id, dto);
  }

  // ==========================================
  // GOOGLE & MICROSOFT CALENDAR INTEGRATIONS
  // ==========================================

  /**
   * List configured calendar integrations (Google, Microsoft).
   */
  @Get('employers/interviews/calendar/integrations')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async listCalendarIntegrations(@CurrentUser() user: AuthUser) {
    if (!this.calendarIntegrationsService) return [];
    return this.calendarIntegrationsService.listIntegrations(user);
  }

  /**
   * Generate OAuth URL for Google or Microsoft Calendar.
   */
  @Get('employers/interviews/calendar/integrations/auth-url')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async getCalendarAuthUrl(
    @CurrentUser() user: AuthUser,
    @Query() dto: GenerateOAuthUrlDto,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.getAuthUrl(user, dto);
  }

  /**
   * Handle OAuth authorization code callback.
   */
  @Post('employers/interviews/calendar/integrations/callback')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async handleCalendarOAuthCallback(
    @CurrentUser() user: AuthUser,
    @Body() dto: CalendarOAuthCallbackDto,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.handleOAuthCallback(user, dto);
  }

  /**
   * Connect or manually configure calendar settings.
   */
  @Post('employers/interviews/calendar/integrations/connect')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async connectCalendarManual(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConnectCalendarIntegrationDto,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.connectManual(user, dto);
  }

  /**
   * Update calendar integration settings.
   */
  @Put('employers/interviews/calendar/integrations/:provider')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async updateCalendarIntegration(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: CalendarProvider,
    @Body() dto: UpdateCalendarIntegrationDto,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.updateIntegration(user, provider, dto);
  }

  /**
   * Disconnect a calendar integration.
   */
  @Delete('employers/interviews/calendar/integrations/:provider')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async disconnectCalendarIntegration(
    @CurrentUser() user: AuthUser,
    @Param('provider') provider: CalendarProvider,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.disconnect(user, provider);
  }

  /**
   * Trigger full manual sync with external calendars.
   */
  @Post('employers/interviews/calendar/integrations/sync')
  @Roles(Role.EMPLOYER, Role.ADMIN)
  async syncCalendarIntegrations(
    @CurrentUser() user: AuthUser,
    @Query('provider') provider?: CalendarProvider,
  ) {
    if (!this.calendarIntegrationsService) return null;
    return this.calendarIntegrationsService.triggerFullSync(user, provider);
  }
}

