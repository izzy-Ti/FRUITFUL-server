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
