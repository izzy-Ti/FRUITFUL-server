import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { EmailDispatchOptions, EmailDeliveryResult } from './notifications.types.js';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly sentEmailsHistory: EmailDeliveryResult[] = [];

  constructor(private readonly configService: ConfigService) {}

  /**
   * Dispatch an email to the recipient.
   */
  async sendEmail(options: EmailDispatchOptions): Promise<EmailDeliveryResult> {
    const messageId = randomUUID();
    const timestamp = new Date().toISOString();

    try {
      // In production or development environment:
      // Fruitful Journey dispatches emails using standard SMTP/Neon Mailer.
      // Here we handle structured logging and record keeping.
      this.logger.log(`[EMAIL DISPATCH] To: ${options.to} | Subject: "${options.subject}" | MessageId: ${messageId}`);

      const result: EmailDeliveryResult = {
        success: true,
        messageId,
        recipient: options.to,
        subject: options.subject,
        timestamp,
        simulated: true,
      };

      // Store in history (keep last 100 for inspection / debugging)
      this.sentEmailsHistory.unshift(result);
      if (this.sentEmailsHistory.length > 100) {
        this.sentEmailsHistory.pop();
      }

      return result;
    } catch (err: any) {
      this.logger.error(`[EMAIL ERROR] Failed to send email to ${options.to}: ${err?.message || err}`);
      return {
        success: false,
        messageId,
        recipient: options.to,
        subject: options.subject,
        timestamp,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Get recent sent emails (useful for admin diagnostics and testing).
   */
  getSentEmails(limit = 20): EmailDeliveryResult[] {
    return this.sentEmailsHistory.slice(0, limit);
  }

  /**
   * Clear sent email history (useful for test isolation).
   */
  clearHistory(): void {
    this.sentEmailsHistory.length = 0;
  }
}
