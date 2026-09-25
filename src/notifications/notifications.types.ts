export enum NotificationType {
  ACCOUNT_VERIFICATION = 'account_verification',
  PASSWORD_RESET = 'password_reset',
  APPLICATION_RECEIVED = 'application_received',
  APPLICATION_STATUS_CHANGE = 'application_status_change',
  EMPLOYER_VERIFICATION = 'employer_verification',
  ADMIN_MODERATION_ALERT = 'admin_moderation_alert',
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

export interface EmailDispatchOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId: string;
  recipient: string;
  subject: string;
  timestamp: string;
  simulated?: boolean;
  error?: string;
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
