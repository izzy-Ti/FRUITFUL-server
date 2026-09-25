import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  ProcessRemindersDto,
  SendManualReminderDto,
  DueReminderInterview,
  ReminderType,
  ReminderRecipient,
} from './dto/reminders.dto.js';
import { InterviewStatus } from './dto/index.js';

@Injectable()
export class InterviewRemindersService {
  private readonly logger = new Logger(InterviewRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Process and dispatch all due reminders (24h, 1h, 15m) across all scheduled interviews.
   */
  async triggerDueReminders(dto?: ProcessRemindersDto): Promise<{
    processed24h: number;
    processed1h: number;
    processed15m: number;
    totalProcessed: number;
    dryRun: boolean;
    details: Array<{ interviewId: string; title: string; reminderType: string }>;
  }> {
    const now = Date.now();
    const dryRun = dto?.dryRun ?? false;

    let scheduled: any[] = [];
    let rescheduled: any[] = [];

    try {
      const scheduledResult = this.prisma.client.orm.public.JobInterview.where({
        status: InterviewStatus.SCHEDULED,
      });
      scheduled = (await scheduledResult?.all?.()) || [];
    } catch {
      scheduled = [];
    }

    try {
      const rescheduledResult = this.prisma.client.orm.public.JobInterview.where({
        status: InterviewStatus.RESCHEDULED,
      });
      rescheduled = (await rescheduledResult?.all?.()) || [];
    } catch {
      rescheduled = [];
    }

    const interviews = [...scheduled, ...rescheduled];
    let processed24h = 0;
    let processed1h = 0;
    let processed15m = 0;
    const details: Array<{ interviewId: string; title: string; reminderType: string }> = [];

    for (const interview of interviews) {
      const startMs = new Date(interview.startTime).getTime();
      const diffMins = Math.round((startMs - now) / 60000);

      // Skip past interviews
      if (diffMins <= 0) continue;

      // 15-Minute Reminder: 0 to 20 minutes before start
      if (diffMins <= 20 && !interview.reminderSent15m) {
        if (!dryRun) {
          await this.dispatchReminder(interview, '15m');
          await this.prisma.client.orm.public.JobInterview
            .where({ id: interview.id })
            .update({ reminderSent15m: true });
        }
        processed15m++;
        details.push({ interviewId: interview.id, title: interview.title, reminderType: '15m' });
      }
      // 1-Hour Reminder: 21 to 75 minutes before start
      else if (diffMins > 20 && diffMins <= 75 && !interview.reminderSent1h) {
        if (!dryRun) {
          await this.dispatchReminder(interview, '1h');
          await this.prisma.client.orm.public.JobInterview
            .where({ id: interview.id })
            .update({ reminderSent1h: true });
        }
        processed1h++;
        details.push({ interviewId: interview.id, title: interview.title, reminderType: '1h' });
      }
      // 24-Hour Reminder: 76 to 1500 minutes before start (~25 hours)
      else if (diffMins > 75 && diffMins <= 1500 && !interview.reminderSent24h) {
        if (!dryRun) {
          await this.dispatchReminder(interview, '24h');
          await this.prisma.client.orm.public.JobInterview
            .where({ id: interview.id })
            .update({ reminderSent24h: true });
        }
        processed24h++;
        details.push({ interviewId: interview.id, title: interview.title, reminderType: '24h' });
      }
    }

    const totalProcessed = processed24h + processed1h + processed15m;
    this.logger.log(
      `Automated interview reminders run completed: 24h=${processed24h}, 1h=${processed1h}, 15m=${processed15m} (dryRun=${dryRun})`,
    );

    return {
      processed24h,
      processed1h,
      processed15m,
      totalProcessed,
      dryRun,
      details,
    };
  }

  /**
   * Preview upcoming interviews that are due for reminders within a lookahead window.
   */
  async getDueReminders(user: AuthUser, lookaheadMinutes = 1440): Promise<DueReminderInterview[]> {
    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (!employer && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Employer profile not found.');
    }

    const now = Date.now();
    let interviews: any[] = [];

    const isEmployer = !!employer;
    if (isEmployer) {
      const scheduled = (await this.prisma.client.orm.public.JobInterview
        .where({
          employerId: employer.id,
          status: InterviewStatus.SCHEDULED,
        })
        ?.all?.()) || [];
      const rescheduled = (await this.prisma.client.orm.public.JobInterview
        .where({
          employerId: employer.id,
          status: InterviewStatus.RESCHEDULED,
        })
        ?.all?.()) || [];
      interviews = [...scheduled, ...rescheduled];
    } else {
      const scheduled = (await this.prisma.client.orm.public.JobInterview
        .where({ status: InterviewStatus.SCHEDULED })
        ?.all?.()) || [];
      const rescheduled = (await this.prisma.client.orm.public.JobInterview
        .where({ status: InterviewStatus.RESCHEDULED })
        ?.all?.()) || [];
      interviews = [...scheduled, ...rescheduled];
    }

    const dueList: DueReminderInterview[] = [];

    for (const interview of interviews) {
      const startMs = new Date(interview.startTime).getTime();
      const diffMins = Math.round((startMs - now) / 60000);

      if (diffMins <= 0 || diffMins > lookaheadMinutes) continue;

      const dueTypes: ('24h' | '1h' | '15m')[] = [];
      if (diffMins <= 20 && !interview.reminderSent15m) dueTypes.push('15m');
      if (diffMins <= 75 && !interview.reminderSent1h) dueTypes.push('1h');
      if (diffMins <= 1500 && !interview.reminderSent24h) dueTypes.push('24h');

      if (dueTypes.length > 0) {
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
        const employerRec = await this.prisma.client.orm.public.EmployerProfile
          .where({ id: interview.employerId })
          .first();

        dueList.push({
          id: interview.id,
          title: interview.title,
          startTime: interview.startTime,
          endTime: interview.endTime,
          timezone: interview.timezone,
          candidateName: candidateUser?.name || 'Candidate',
          candidateEmail: candidateUser?.email || '',
          employerName: employerRec?.name || 'Employer',
          jobTitle: job?.title || 'Job Position',
          meetingLink: interview.meetingLink,
          dueTypes,
          minutesUntilStart: diffMins,
        });
      }
    }

    return dueList;
  }

  /**
   * Manually trigger an immediate reminder for a specific interview.
   */
  async sendManualReminder(
    user: AuthUser,
    interviewId: string,
    dto: SendManualReminderDto,
  ): Promise<{ success: boolean; message: string; reminderType: string }> {
    const interview = await this.prisma.client.orm.public.JobInterview
      .where({ id: interviewId })
      .first();

    if (!interview) {
      throw new NotFoundException(`Interview #${interviewId} not found.`);
    }

    const employer = await this.prisma.client.orm.public.EmployerProfile
      .where({ userId: user.id })
      .first();

    if (employer && interview.employerId !== employer.id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to send reminders for this interview.');
    }

    const reminderType = dto.reminderType || ReminderType.CUSTOM;
    await this.dispatchReminder(
      interview,
      reminderType as any,
      dto.customMessage,
      dto.recipient || ReminderRecipient.ALL,
    );

    return {
      success: true,
      message: `Interview reminder (${reminderType}) sent successfully.`,
      reminderType,
    };
  }

  /**
   * Dispatch email and notifications for a reminder.
   */
  private async dispatchReminder(
    interview: any,
    type: '24h' | '1h' | '15m' | 'custom',
    customMessage?: string,
    recipient: ReminderRecipient = ReminderRecipient.ALL,
  ) {
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

      let interviewerEmails: string[] = [];
      if (
        (recipient === ReminderRecipient.ALL || recipient === ReminderRecipient.INTERVIEWERS) &&
        interview.interviewerIds?.length > 0
      ) {
        try {
          const users = await this.prisma.client.orm.public.User
            .where({ id: [...interview.interviewerIds] as any })
            ?.all?.();
          interviewerEmails = (users || []).map((u: any) => u.email).filter(Boolean);
        } catch {
          // Continue if DB retrieval skipped
        }
      }

      if (candidateUser && (recipient === ReminderRecipient.ALL || recipient === ReminderRecipient.CANDIDATE)) {
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
          candidateInstructions: customMessage || interview.candidateInstructions,
          interviewerEmails,
          isReminder: true,
          reminderType: type,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch reminder for interview #${interview.id}: ${err?.message || err}`);
    }
  }
}
