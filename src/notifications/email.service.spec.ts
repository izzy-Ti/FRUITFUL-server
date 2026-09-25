import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    const mockConfigService = {
      get: () => 'development',
    } as unknown as ConfigService;
    service = new EmailService(mockConfigService);
    service.clearHistory();
  });

  it('should dispatch an email and record delivery in history', async () => {
    const result = await service.sendEmail({
      to: 'candidate@example.com',
      subject: 'Welcome to Fruitful Journey',
      html: '<p>Welcome!</p>',
      text: 'Welcome!',
    });

    expect(result.success).toBe(true);
    expect(result.recipient).toBe('candidate@example.com');
    expect(result.messageId).toBeDefined();

    const history = service.getSentEmails();
    expect(history).toHaveLength(1);
    expect(history[0].messageId).toBe(result.messageId);
  });

  it('should dispatch an email with calendar invite attachments', async () => {
    const result = await service.sendEmail({
      to: 'candidate@example.com',
      subject: 'Interview Invitation',
      html: '<p>You have an interview</p>',
      text: 'You have an interview',
      attachments: [
        {
          filename: 'invite.ics',
          content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR',
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.attachmentsCount).toBe(1);
    const history = service.getSentEmails();
    expect(history[0].attachmentsCount).toBe(1);
  });

  it('should clear history when requested', async () => {
    await service.sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });
    expect(service.getSentEmails()).toHaveLength(1);

    service.clearHistory();
    expect(service.getSentEmails()).toHaveLength(0);
  });
});
