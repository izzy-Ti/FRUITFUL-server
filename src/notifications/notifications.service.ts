import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from './email.service.js';
import { EmailTemplates } from './email-templates.js';
import {
  NotificationType,
  type AccountVerificationEmailPayload,
  type PasswordResetEmailPayload,
  type ApplicationReceivedNotificationPayload,
  type ApplicationStatusChangeNotificationPayload,
  type EmployerVerificationNotificationPayload,
  type AdminModerationAlertPayload,
  type NotificationRecord,
  type InterviewNotificationPayload,
  type InterviewCancellationPayload,
  type JobOfferNotificationPayload,
  type OfferStatusChangeNotificationPayload,
  type CandidateRejectionNotificationPayload,
} from './notifications.types.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ==========================================
  // 1. ACCOUNT VERIFICATION EMAIL
  // ==========================================

  async sendAccountVerificationEmail(payload: AccountVerificationEmailPayload) {
    const template = EmailTemplates.accountVerification({
      name: payload.name,
      email: payload.email,
      verificationUrl: payload.verificationUrl,
      otp: payload.otp,
    });

    const emailResult = await this.emailService.sendEmail({
      to: payload.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    // If userId not provided, look up by email
    let targetUserId = payload.userId;
    if (!targetUserId) {
      try {
        const user = await this.prisma.client.orm.public.User
          .where({ email: payload.email })
          .first();
        if (user) targetUserId = user.id;
      } catch {
        // Continue if DB unavailable
      }
    }

    let notificationRecord = null;
    if (targetUserId) {
      notificationRecord = await this.createNotification({
        userId: targetUserId,
        type: NotificationType.ACCOUNT_VERIFICATION,
        title: 'Verify your Fruitful Journey account',
        message: 'A verification link has been sent to your email address.',
        data: { email: payload.email, verificationUrl: payload.verificationUrl, otp: payload.otp },
        emailSent: emailResult.success,
        emailDeliveryStatus: emailResult.success ? 'sent' : 'failed',
      });
    }

    return {
      success: emailResult.success,
      emailSent: emailResult.success,
      notification: notificationRecord,
      message: 'Account verification email dispatched.',
    };
  }

  // ==========================================
  // 2. PASSWORD RESET EMAIL
  // ==========================================

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload) {
    const template = EmailTemplates.passwordReset({
      name: payload.name,
      email: payload.email,
      resetUrl: payload.resetUrl,
      token: payload.token,
    });

    const emailResult = await this.emailService.sendEmail({
      to: payload.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    let targetUserId = payload.userId;
    if (!targetUserId) {
      try {
        const user = await this.prisma.client.orm.public.User
          .where({ email: payload.email })
          .first();
        if (user) targetUserId = user.id;
      } catch {
        // Continue if DB unavailable
      }
    }

    let notificationRecord = null;
    if (targetUserId) {
      notificationRecord = await this.createNotification({
        userId: targetUserId,
        type: NotificationType.PASSWORD_RESET,
        title: 'Password reset requested',
        message: 'A password reset link was dispatched to your email.',
        data: { email: payload.email, resetUrl: payload.resetUrl },
        emailSent: emailResult.success,
        emailDeliveryStatus: emailResult.success ? 'sent' : 'failed',
      });
    }

    return {
      success: emailResult.success,
      emailSent: emailResult.success,
      notification: notificationRecord,
      message: 'Password reset email dispatched.',
    };
  }

  // ==========================================
  // 3. APPLICATION RECEIVED NOTIFICATION
  // ==========================================

  async sendApplicationReceivedNotification(payload: ApplicationReceivedNotificationPayload) {
    // A. Notify Candidate
    const candidateTemplate = EmailTemplates.applicationReceivedCandidate({
      candidateName: payload.candidateName,
      jobTitle: payload.jobTitle,
      companyName: payload.companyName,
      applicationId: payload.applicationId,
    });

    const candidateEmailResult = await this.emailService.sendEmail({
      to: payload.candidateEmail,
      subject: candidateTemplate.subject,
      html: candidateTemplate.html,
      text: candidateTemplate.text,
    });

    const candidateNotification = await this.createNotification({
      userId: payload.candidateUserId,
      type: NotificationType.APPLICATION_RECEIVED,
      title: `Application Submitted: ${payload.jobTitle}`,
      message: `Your application for ${payload.jobTitle} at ${payload.companyName} was successfully submitted.`,
      data: {
        jobId: payload.jobId,
        applicationId: payload.applicationId,
        companyName: payload.companyName,
      },
      emailSent: candidateEmailResult.success,
      emailDeliveryStatus: candidateEmailResult.success ? 'sent' : 'failed',
    });

    // B. Notify Employer
    let employerNotification = null;
    if (payload.employerUserId) {
      let employerEmail = payload.employerEmail;
      if (!employerEmail) {
        try {
          const empUser = await this.prisma.client.orm.public.User
            .where({ id: payload.employerUserId })
            .first();
          if (empUser) employerEmail = empUser.email;
        } catch {
          // ignore
        }
      }

      let employerEmailSent = false;
      if (employerEmail) {
        const employerTemplate = EmailTemplates.applicationReceivedEmployer({
          employerName: payload.companyName,
          candidateName: payload.candidateName,
          jobTitle: payload.jobTitle,
          applicationId: payload.applicationId,
        });

        const employerEmailResult = await this.emailService.sendEmail({
          to: employerEmail,
          subject: employerTemplate.subject,
          html: employerTemplate.html,
          text: employerTemplate.text,
        });
        employerEmailSent = employerEmailResult.success;
      }

      employerNotification = await this.createNotification({
        userId: payload.employerUserId,
        type: NotificationType.APPLICATION_RECEIVED,
        title: `New Applicant: ${payload.jobTitle}`,
        message: `${payload.candidateName} has applied for your job listing: ${payload.jobTitle}.`,
        data: {
          jobId: payload.jobId,
          applicationId: payload.applicationId,
          candidateUserId: payload.candidateUserId,
          candidateName: payload.candidateName,
        },
        emailSent: employerEmailSent,
        emailDeliveryStatus: employerEmailSent ? 'sent' : 'skipped',
      });
    }

    return {
      success: true,
      candidateNotification,
      employerNotification,
    };
  }

  // ==========================================
  // 4. APPLICATION STATUS CHANGE NOTIFICATION
  // ==========================================

  async sendApplicationStatusChangeNotification(payload: ApplicationStatusChangeNotificationPayload) {
    const template = EmailTemplates.applicationStatusChange({
      candidateName: payload.candidateName,
      jobTitle: payload.jobTitle,
      companyName: payload.companyName,
      newStatus: payload.newStatus,
      previousStatus: payload.previousStatus,
      notes: payload.employerNotes,
    });

    const emailResult = await this.emailService.sendEmail({
      to: payload.candidateEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    const notification = await this.createNotification({
      userId: payload.candidateUserId,
      type: NotificationType.APPLICATION_STATUS_CHANGE,
      title: `Application Update: ${payload.jobTitle}`,
      message: `Your application status for ${payload.jobTitle} at ${payload.companyName} has been updated to "${payload.newStatus}".`,
      data: {
        applicationId: payload.applicationId,
        jobTitle: payload.jobTitle,
        companyName: payload.companyName,
        newStatus: payload.newStatus,
        previousStatus: payload.previousStatus,
        notes: payload.employerNotes || null,
      },
      emailSent: emailResult.success,
      emailDeliveryStatus: emailResult.success ? 'sent' : 'failed',
    });

    return {
      success: true,
      notification,
    };
  }

  // ==========================================
  // 5. EMPLOYER VERIFICATION NOTIFICATION
  // ==========================================

  async sendEmployerVerificationNotification(payload: EmployerVerificationNotificationPayload) {
    const template = EmailTemplates.employerVerification({
      companyName: payload.companyName,
      status: payload.status,
      reason: payload.rejectionReason,
    });

    const emailResult = await this.emailService.sendEmail({
      to: payload.employerEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    const isVerified = payload.status === 'verified';
    const notification = await this.createNotification({
      userId: payload.employerUserId,
      type: NotificationType.EMPLOYER_VERIFICATION,
      title: isVerified
        ? `Organization Verified: ${payload.companyName}`
        : `Verification Update: ${payload.companyName}`,
      message: isVerified
        ? `Congratulations! Your employer profile for "${payload.companyName}" has been verified by administrators.`
        : `Your verification request for "${payload.companyName}" was not approved. ${payload.rejectionReason ? `Reason: ${payload.rejectionReason}` : ''}`,
      data: {
        status: payload.status,
        companyName: payload.companyName,
        rejectionReason: payload.rejectionReason || null,
      },
      emailSent: emailResult.success,
      emailDeliveryStatus: emailResult.success ? 'sent' : 'failed',
    });

    return {
      success: true,
      notification,
    };
  }

  // ==========================================
  // 6. IMPORTANT ADMIN & MODERATION ALERTS
  // ==========================================

  async sendAdminModerationAlert(payload: AdminModerationAlertPayload) {
    const notificationsCreated: any[] = [];

    // A. Broadcast alert to platform administrators
    if (payload.notifyAdmins !== false) {
      try {
        const admins = await this.prisma.client.orm.public.User
          .where({ role: 'admin' })
          .all();

        for (const admin of admins) {
          const adminNotification = await this.createNotification({
            userId: admin.id,
            type: NotificationType.ADMIN_MODERATION_ALERT,
            title: `[Admin Alert] ${payload.title}`,
            message: payload.message,
            data: {
              alertType: payload.alertType,
              entityType: payload.entityType,
              entityId: payload.entityId,
              metadata: payload.metadata || null,
            },
            emailSent: false,
            emailDeliveryStatus: 'internal',
          });

          if (adminNotification) {
            notificationsCreated.push(adminNotification);
          }

          // Also dispatch email alert if admin has email
          if (admin.email) {
            const template = EmailTemplates.adminModerationAlert({
              alertType: payload.alertType,
              title: payload.title,
              message: payload.message,
              entityType: payload.entityType,
              entityId: payload.entityId,
            });

            await this.emailService.sendEmail({
              to: admin.email,
              subject: template.subject,
              html: template.html,
              text: template.text,
            });
          }
        }
      } catch (err: any) {
        this.logger.error(`Error notifying admins of moderation alert: ${err?.message || err}`);
      }
    }

    // B. If a target user was affected by moderation (e.g., account suspended, portfolio rejected), notify them
    if (payload.targetUserId) {
      const userNotification = await this.createNotification({
        userId: payload.targetUserId,
        type: NotificationType.ADMIN_MODERATION_ALERT,
        title: payload.title,
        message: payload.message,
        data: {
          alertType: payload.alertType,
          entityType: payload.entityType,
          entityId: payload.entityId,
          metadata: payload.metadata || null,
        },
        emailSent: false,
        emailDeliveryStatus: 'delivered',
      });

      if (userNotification) {
        notificationsCreated.push(userNotification);
      }
    }

    return {
      success: true,
      count: notificationsCreated.length,
      notifications: notificationsCreated,
    };
  }

  // ==========================================
  // 7. NEW MESSAGE NOTIFICATION
  // ==========================================

  async sendNewMessageNotification(payload: {
    recipientUserId: string;
    recipientEmail?: string | null;
    recipientName?: string;
    senderUserId: string;
    senderName: string;
    conversationId: string;
    messagePreview: string;
    sendEmail?: boolean;
  }) {
    let emailSent = false;
    let emailDeliveryStatus = 'skipped';

    if (payload.sendEmail !== false && payload.recipientEmail) {
      try {
        const template = EmailTemplates.newMessageNotification({
          recipientName: payload.recipientName,
          senderName: payload.senderName,
          messagePreview: payload.messagePreview,
        });

        const emailResult = await this.emailService.sendEmail({
          to: payload.recipientEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });

        emailSent = emailResult.success;
        emailDeliveryStatus = emailResult.success ? 'sent' : 'failed';
      } catch (err) {
        this.logger.warn(`Failed to send new message email to ${payload.recipientEmail}: ${err}`);
      }
    }

    const notification = await this.createNotification({
      userId: payload.recipientUserId,
      type: NotificationType.NEW_MESSAGE,
      title: `New message from ${payload.senderName}`,
      message: payload.messagePreview,
      data: {
        conversationId: payload.conversationId,
        senderUserId: payload.senderUserId,
        senderName: payload.senderName,
      },
      emailSent,
      emailDeliveryStatus,
    });

    return {
      success: true,
      emailSent,
      notification,
    };
  }

  // ==========================================
  // USER NOTIFICATION INBOX OPERATIONS
  // ==========================================
  // ==========================================

  /**
   * Retrieve paginated notifications for a specific user.
   */
  async getUserNotifications(
    userId: string,
    query?: { read?: boolean; page?: number; limit?: number },
  ) {
    let collection = this.prisma.client.orm.public.Notification
      .where({ userId });

    if (query?.read !== undefined) {
      collection = collection.where({ read: query.read });
    }

    const all = await collection
      .orderBy((n) => n.createdAt.desc())
      .all();

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const total = all.length;
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    return {
      count: paginated.length,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount: all.filter((n) => !n.read).length,
      notifications: paginated.map((n) => ({
        ...n,
        data: n.data ? this.safeParseJson(n.data) : null,
      })),
    };
  }

  /**
   * Count unread notifications for a user.
   */
  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unread = await this.prisma.client.orm.public.Notification
      .where({ userId, read: false })
      .all();

    return { unreadCount: unread.length };
  }

  /**
   * Mark a specific notification as read.
   */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationRecord> {
    const notification = await this.prisma.client.orm.public.Notification
      .where({ id: notificationId })
      .first();

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${notificationId}" was not found.`);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You do not have permission to modify this notification.');
    }

    await this.prisma.client.orm.public.Notification
      .where({ id: notificationId })
      .update({
        read: true,
        readAt: new Date().toISOString(),
      });

    const updated = await this.prisma.client.orm.public.Notification
      .where({ id: notificationId })
      .first();

    return {
      ...updated!,
      data: updated!.data ? this.safeParseJson(updated!.data) : null,
    };
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<{ success: boolean; updatedCount: number }> {
    const unread = await this.prisma.client.orm.public.Notification
      .where({ userId, read: false })
      .all();

    const nowIso = new Date().toISOString();
    await Promise.all(
      unread.map((n) =>
        this.prisma.client.orm.public.Notification
          .where({ id: n.id })
          .update({
            read: true,
            readAt: nowIso,
          }),
      ),
    );

    return {
      success: true,
      updatedCount: unread.length,
    };
  }

  /**
   * Delete a notification.
   */
  async deleteNotification(userId: string, notificationId: string): Promise<{ success: boolean }> {
    const notification = await this.prisma.client.orm.public.Notification
      .where({ id: notificationId })
      .first();

    if (!notification) {
      throw new NotFoundException(`Notification with ID "${notificationId}" was not found.`);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this notification.');
    }

    await this.prisma.client.orm.public.Notification
      .where({ id: notificationId })
      .delete();

    return { success: true };
  }

  // ==========================================
  // 6. INTERVIEW NOTIFICATIONS & REMINDERS
  // ==========================================

  async sendInterviewNotification(payload: InterviewNotificationPayload) {
    const template = EmailTemplates.interviewInvitationOrReminder({
      candidateName: payload.candidateName,
      employerName: payload.employerName,
      jobTitle: payload.jobTitle,
      interviewTitle: payload.interviewTitle,
      interviewType: payload.interviewType,
      startTime: payload.startTime,
      endTime: payload.endTime,
      timezone: payload.timezone,
      candidateTimezone: payload.candidateTimezone,
      meetingLink: payload.meetingLink,
      location: payload.location,
      candidateInstructions: payload.candidateInstructions,
      interviewId: payload.interviewId,
      isReminder: payload.isReminder,
      reminderType: payload.reminderType,
      isRescheduled: payload.isRescheduled,
      previousStartTime: payload.previousStartTime,
    });

    const attachments = payload.icsAttachment
      ? [
          {
            filename: payload.icsAttachment.filename || 'invite.ics',
            content: payload.icsAttachment.content,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ]
      : undefined;

    let emailResult = null;
    if (payload.candidateEmail) {
      emailResult = await this.emailService.sendEmail({
        to: payload.candidateEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments,
      });
    }

    // Also dispatch calendar invite to assigned interviewers
    if (payload.interviewerEmails && payload.interviewerEmails.length > 0) {
      for (const interviewerEmail of payload.interviewerEmails) {
        if (interviewerEmail && interviewerEmail !== payload.candidateEmail) {
          try {
            await this.emailService.sendEmail({
              to: interviewerEmail,
              subject: `[Interviewer Notice] ${template.subject}`,
              html: template.html,
              text: template.text,
              attachments,
            });
          } catch (err) {
            this.logger.warn(`Failed to dispatch interview email to interviewer ${interviewerEmail}: ${err}`);
          }
        }
      }
    }

    const type = payload.isReminder
      ? NotificationType.INTERVIEW_REMINDER
      : NotificationType.INTERVIEW_SCHEDULED;

    const notifTitle = payload.isReminder
      ? `Interview Reminder: ${payload.interviewTitle} (${payload.jobTitle})`
      : payload.isRescheduled
      ? `Interview Rescheduled: ${payload.interviewTitle} (${payload.jobTitle})`
      : `Interview Scheduled: ${payload.interviewTitle} (${payload.jobTitle})`;

    const notifMsg = payload.isReminder
      ? `Upcoming interview with ${payload.employerName} starting at ${new Date(payload.startTime).toLocaleTimeString()}`
      : payload.isRescheduled
      ? `${payload.employerName} has rescheduled your interview for ${payload.jobTitle}.`
      : `${payload.employerName} has scheduled an interview for ${payload.jobTitle}.`;

    return this.createNotification({
      userId: payload.candidateUserId,
      type,
      title: notifTitle,
      message: notifMsg,
      data: {
        interviewId: payload.interviewId,
        meetingLink: payload.meetingLink,
        startTime: payload.startTime,
        endTime: payload.endTime,
        isRescheduled: payload.isRescheduled,
      },
      emailSent: emailResult ? emailResult.success : false,
      emailDeliveryStatus: emailResult
        ? emailResult.success
          ? 'delivered'
          : 'failed'
        : 'skipped',
    });
  }

  async sendInterviewRescheduledNotification(payload: InterviewNotificationPayload) {
    return this.sendInterviewNotification({
      ...payload,
      isRescheduled: true,
    });
  }

  async sendInterviewCancellationNotification(payload: InterviewCancellationPayload) {
    const template = EmailTemplates.interviewCancelled({
      candidateName: payload.candidateName,
      employerName: payload.employerName,
      jobTitle: payload.jobTitle,
      interviewTitle: payload.interviewTitle,
      startTime: payload.startTime,
      cancellationReason: payload.cancellationReason,
    });

    const attachments = payload.icsAttachment
      ? [
          {
            filename: payload.icsAttachment.filename || 'cancel.ics',
            content: payload.icsAttachment.content,
            contentType: 'text/calendar; charset=utf-8; method=CANCEL',
          },
        ]
      : undefined;

    let emailResult = null;
    if (payload.candidateEmail) {
      emailResult = await this.emailService.sendEmail({
        to: payload.candidateEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments,
      });
    }

    // Also dispatch cancellation notice to assigned interviewers
    if (payload.interviewerEmails && payload.interviewerEmails.length > 0) {
      for (const interviewerEmail of payload.interviewerEmails) {
        if (interviewerEmail && interviewerEmail !== payload.candidateEmail) {
          try {
            await this.emailService.sendEmail({
              to: interviewerEmail,
              subject: `[Interviewer Notice] ${template.subject}`,
              html: template.html,
              text: template.text,
              attachments,
            });
          } catch (err) {
            this.logger.warn(`Failed to dispatch interview cancellation email to interviewer ${interviewerEmail}: ${err}`);
          }
        }
      }
    }

    return this.createNotification({
      userId: payload.candidateUserId,
      type: NotificationType.INTERVIEW_CANCELLED,
      title: `Interview Cancelled: ${payload.interviewTitle}`,
      message: `Your scheduled interview with ${payload.employerName} for ${payload.jobTitle} was cancelled.`,
      data: {
        jobTitle: payload.jobTitle,
        reason: payload.cancellationReason,
      },
      emailSent: emailResult ? emailResult.success : false,
      emailDeliveryStatus: emailResult
        ? emailResult.success
          ? 'delivered'
          : 'failed'
        : 'skipped',
    });
  }

  // ==========================================
  // 7. JOB OFFER NOTIFICATIONS
  // ==========================================

  async sendJobOfferNotification(payload: JobOfferNotificationPayload) {
    const template = EmailTemplates.jobOffer({
      candidateName: payload.candidateName,
      employerName: payload.employerName,
      jobTitle: payload.jobTitle,
      salary: payload.salary,
      currency: payload.currency,
      salaryPeriod: payload.salaryPeriod,
      startDate: payload.startDate,
      expiryDate: payload.expiryDate,
      benefits: payload.benefits,
    });

    let emailResult = null;
    if (payload.candidateEmail) {
      emailResult = await this.emailService.sendEmail({
        to: payload.candidateEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }

    return this.createNotification({
      userId: payload.candidateUserId,
      type: NotificationType.OFFER_RECEIVED,
      title: `Job Offer: ${payload.jobTitle} at ${payload.employerName}`,
      message: `Congratulations! ${payload.employerName} has extended an official offer of ${payload.currency} ${payload.salary.toLocaleString()}/${payload.salaryPeriod}.`,
      data: {
        offerId: payload.offerId,
        salary: payload.salary,
        currency: payload.currency,
        startDate: payload.startDate,
      },
      emailSent: emailResult ? emailResult.success : false,
      emailDeliveryStatus: emailResult
        ? emailResult.success
          ? 'delivered'
          : 'failed'
        : 'skipped',
    });
  }

  async sendOfferStatusNotification(payload: OfferStatusChangeNotificationPayload) {
    const title = payload.status === 'accepted'
      ? `Candidate Accepted Offer: ${payload.candidateName} (${payload.jobTitle})`
      : `Candidate Declined Offer: ${payload.candidateName} (${payload.jobTitle})`;

    const message = payload.status === 'accepted'
      ? `${payload.candidateName} has formally accepted the job offer for ${payload.jobTitle}!`
      : `${payload.candidateName} has declined the offer. Reason/Feedback: "${payload.candidateFeedback || 'None provided'}"`;

    return this.createNotification({
      userId: payload.employerUserId,
      type: NotificationType.OFFER_STATUS_CHANGE,
      title,
      message,
      data: {
        offerId: payload.offerId,
        status: payload.status,
        candidateFeedback: payload.candidateFeedback,
      },
    });
  }

  // ==========================================
  // 8. CANDIDATE REJECTION NOTIFICATIONS
  // ==========================================

  async sendCandidateRejectionNotification(payload: CandidateRejectionNotificationPayload) {
    const template = EmailTemplates.candidateRejection({
      candidateName: payload.candidateName,
      employerName: payload.employerName,
      jobTitle: payload.jobTitle,
      rejectionReasonLabel: payload.rejectionReasonLabel,
      rejectionFeedback: payload.rejectionFeedback,
    });

    let emailResult = null;
    if (payload.candidateEmail) {
      emailResult = await this.emailService.sendEmail({
        to: payload.candidateEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }

    return this.createNotification({
      userId: payload.candidateUserId,
      type: NotificationType.CANDIDATE_REJECTED,
      title: `Update on your application for ${payload.jobTitle}`,
      message: `Your application with ${payload.employerName} for ${payload.jobTitle} has been updated.`,
      data: {
        applicationId: payload.applicationId,
        feedback: payload.rejectionFeedback,
      },
      emailSent: emailResult ? emailResult.success : false,
      emailDeliveryStatus: emailResult
        ? emailResult.success
          ? 'delivered'
          : 'failed'
        : 'skipped',
    });
  }

  // ==========================================
  // PRIVATE HELPER
  // ==========================================

  private async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
    emailSent?: boolean;
    emailDeliveryStatus?: string;
  }) {
    try {
      const dataStr = data.data
        ? typeof data.data === 'string'
          ? data.data
          : JSON.stringify(data.data)
        : null;

      const record = await this.prisma.client.orm.public.Notification.create({
        id: randomUUID(),
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: dataStr,
        read: false,
        readAt: null,
        emailSent: data.emailSent ?? false,
        emailDeliveryStatus: data.emailDeliveryStatus || null,
      });

      this.logger.log(`[NOTIFICATION CREATED] Type: ${data.type} for User ${data.userId}`);
      return {
        ...record,
        data: data.data || null,
      };
    } catch (err: any) {
      this.logger.error(`Failed to create notification record: ${err?.message || err}`);
      return null;
    }
  }

  private safeParseJson(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
}
