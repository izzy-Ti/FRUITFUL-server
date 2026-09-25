export enum NotificationType {
  ACCOUNT_VERIFICATION = 'account_verification',
  PASSWORD_RESET = 'password_reset',
  APPLICATION_RECEIVED = 'application_received',
  APPLICATION_STATUS_CHANGE = 'application_status_change',
  EMPLOYER_VERIFICATION = 'employer_verification',
  ADMIN_MODERATION_ALERT = 'admin_moderation_alert',
  NEW_MESSAGE = 'new_message',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  INTERVIEW_REMINDER = 'interview_reminder',
  INTERVIEW_CANCELLED = 'interview_cancelled',
  OFFER_RECEIVED = 'offer_received',
  OFFER_STATUS_CHANGE = 'offer_status_change',
  CANDIDATE_REJECTED = 'candidate_rejected',
}

export interface NewMessageNotificationPayload {
  recipientUserId: string;
  recipientEmail?: string | null;
  recipientName?: string;
  senderUserId: string;
  senderName: string;
  conversationId: string;
  messagePreview: string;
  sendEmail?: boolean;
}

export interface AccountVerificationEmailPayload {
  userId?: string;
  email: string;
  name?: string;
  token?: string;
  otp?: string;
  verificationUrl?: string;
}

export interface PasswordResetEmailPayload {
  userId?: string;
  email: string;
  name?: string;
  token?: string;
  resetUrl?: string;
}

export interface ApplicationReceivedNotificationPayload {
  candidateUserId: string;
  candidateEmail: string;
  candidateName: string;
  employerUserId: string;
  employerEmail?: string | null;
  jobTitle: string;
  companyName: string;
  applicationId: string;
  jobId: string;
}

export interface ApplicationStatusChangeNotificationPayload {
  candidateUserId: string;
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  applicationId: string;
  newStatus: string;
  previousStatus?: string;
  employerNotes?: string | null;
}

export interface EmployerVerificationNotificationPayload {
  employerUserId: string;
  employerEmail: string;
  companyName: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string | null;
}

export interface AdminModerationAlertPayload {
  adminUserId?: string;
  alertType: 'employer_registered' | 'profile_flagged' | 'portfolio_flagged' | 'user_suspended' | 'job_rejected' | 'security_alert' | string;
  title: string;
  message: string;
  entityType: 'User' | 'EmployerProfile' | 'JobSeekerProfile' | 'PortfolioProject' | 'Job' | string;
  entityId: string;
  metadata?: Record<string, any>;
  notifyAdmins?: boolean;
  targetUserId?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface EmailDispatchOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId: string;
  recipient: string;
  subject: string;
  timestamp: string;
  simulated?: boolean;
  error?: string;
  attachmentsCount?: number;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  readAt: string | null;
  emailSent: boolean;
  emailDeliveryStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewNotificationPayload {
  candidateUserId: string;
  candidateEmail?: string | null;
  candidateName: string;
  employerName: string;
  jobTitle: string;
  interviewId: string;
  interviewTitle: string;
  interviewType: string;
  startTime: string;
  endTime: string;
  timezone: string;
  candidateTimezone?: string;
  meetingLink?: string | null;
  location?: string | null;
  candidateInstructions?: string | null;
  interviewerEmails?: string[];
  organizerEmail?: string;
  icsAttachment?: {
    filename: string;
    content: string;
  };
  isReminder?: boolean;
  reminderType?: '24h' | '1h' | '15m' | 'custom' | string;
  isRescheduled?: boolean;
  previousStartTime?: string;
}

export interface InterviewCancellationPayload {
  candidateUserId: string;
  candidateEmail?: string | null;
  candidateName: string;
  employerName: string;
  jobTitle: string;
  interviewTitle: string;
  startTime: string;
  cancellationReason?: string | null;
  interviewerEmails?: string[];
  organizerEmail?: string;
  icsAttachment?: {
    filename: string;
    content: string;
  };
}

export interface JobOfferNotificationPayload {
  candidateUserId: string;
  candidateEmail?: string | null;
  candidateName: string;
  employerName: string;
  jobTitle: string;
  offerId: string;
  salary: number;
  currency: string;
  salaryPeriod: string;
  startDate: string;
  expiryDate?: string | null;
  benefits?: string[];
  offerLetterUrl?: string | null;
}

export interface OfferStatusChangeNotificationPayload {
  employerUserId: string;
  employerEmail?: string | null;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  offerId: string;
  status: 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  candidateFeedback?: string | null;
}

export interface CandidateRejectionNotificationPayload {
  candidateUserId: string;
  candidateEmail?: string | null;
  candidateName: string;
  employerName: string;
  jobTitle: string;
  applicationId: string;
  rejectionReasonLabel?: string | null;
  rejectionFeedback?: string | null;
}

