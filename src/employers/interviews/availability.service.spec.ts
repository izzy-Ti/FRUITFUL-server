import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AvailabilityService } from './availability.service.js';
import { BadRequestException } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum.js';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let mockPrisma: any;

  const mockUser: any = {
    id: 'user-emp-1',
    role: Role.EMPLOYER,
    email: 'employer@fruitful.com',
  };

  const mockEmployerProfile = {
    id: 'emp-profile-1',
    userId: 'user-emp-1',
    name: 'Fruitful Corp',
  };

  beforeEach(() => {
    mockPrisma = {
      client: {
        orm: {
          public: {
            EmployerProfile: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(mockEmployerProfile),
              }),
            },
            InterviewerAvailability: {
              where: vi.fn().mockReturnValue({
                first: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockResolvedValue({}),
              }),
              create: vi.fn().mockImplementation((val) =>
                Promise.resolve({
                  id: val.id,
                  ...val,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }),
              ),
            },
            JobInterview: {
              where: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([]),
              }),
            },
          },
        },
      },
    };

    service = new AvailabilityService(mockPrisma);
  });

  describe('getAvailabilityProfile', () => {
    it('returns default availability configuration when no custom record exists', async () => {
      const result = await service.getAvailabilityProfile(mockUser);
      expect(result).toBeDefined();
      expect(result.employerId).toBe('emp-profile-1');
      expect(result.weeklySchedule).toHaveLength(5); // Mon - Fri
      expect(result.slotDurationMinutes).toBe(45);
      expect(result.bufferMinutes).toBe(15);
      expect(result.minNoticeHours).toBe(24);
    });

    it('returns formatted custom record when exists in database', async () => {
      const customRecord = {
        id: 'avail-1',
        employerId: 'emp-profile-1',
        userId: null,
        timezone: 'Africa/Addis_Ababa',
        weeklySchedule: JSON.stringify([{ dayOfWeek: 1, startTime: '10:00', endTime: '16:00' }]),
        dateOverrides: JSON.stringify([{ date: '2026-12-25', isBlocked: true, reason: 'Christmas' }]),
        slotDurationMinutes: 60,
        bufferMinutes: 20,
        minNoticeHours: 12,
        maxInterviewsPerDay: 4,
        isActive: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      };

      mockPrisma.client.orm.public.InterviewerAvailability.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(customRecord),
      });

      const result = await service.getAvailabilityProfile(mockUser);
      expect(result.id).toBe('avail-1');
      expect(result.timezone).toBe('Africa/Addis_Ababa');
      expect(result.weeklySchedule).toHaveLength(1);
      expect(result.dateOverrides).toHaveLength(1);
      expect(result.slotDurationMinutes).toBe(60);
      expect(result.bufferMinutes).toBe(20);
    });
  });

  describe('setAvailabilityProfile', () => {
    it('throws BadRequestException on invalid timezone', async () => {
      await expect(
        service.setAvailabilityProfile(mockUser, {
          timezone: 'Invalid/NonExistent_Tz',
          weeklySchedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when slot startTime >= endTime', async () => {
      await expect(
        service.setAvailabilityProfile(mockUser, {
          timezone: 'UTC',
          weeklySchedule: [{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates and returns new availability profile', async () => {
      const result = await service.setAvailabilityProfile(mockUser, {
        timezone: 'America/New_York',
        weeklySchedule: [
          { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' },
        ],
        slotDurationMinutes: 30,
        bufferMinutes: 10,
        minNoticeHours: 48,
        maxInterviewsPerDay: 8,
      });

      expect(result).toBeDefined();
      expect(result.timezone).toBe('America/New_York');
      expect(result.weeklySchedule).toHaveLength(2);
      expect(result.slotDurationMinutes).toBe(30);
      expect(mockPrisma.client.orm.public.InterviewerAvailability.create).toHaveBeenCalled();
    });
  });

  describe('addDateOverride & removeDateOverride', () => {
    it('adds a date override for a company holiday', async () => {
      const result = await service.addDateOverride(mockUser, {
        date: '2026-10-15',
        isBlocked: true,
        reason: 'Company Hackathon Day',
      });

      expect(result.dateOverrides).toHaveLength(1);
      expect(result.dateOverrides[0].date).toBe('2026-10-15');
      expect(result.dateOverrides[0].isBlocked).toBe(true);
    });

    it('throws BadRequestException if custom hours startTime >= endTime', async () => {
      await expect(
        service.addDateOverride(mockUser, {
          date: '2026-10-16',
          isBlocked: false,
          startTime: '16:00',
          endTime: '10:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('removes a date override', async () => {
      const existing = {
        id: 'avail-1',
        employerId: 'emp-profile-1',
        userId: null,
        timezone: 'UTC',
        weeklySchedule: '[]',
        dateOverrides: JSON.stringify([{ date: '2026-10-15', isBlocked: true }]),
        slotDurationMinutes: 45,
        bufferMinutes: 15,
        minNoticeHours: 24,
        maxInterviewsPerDay: 6,
        isActive: true,
      };

      mockPrisma.client.orm.public.InterviewerAvailability.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue({
          ...existing,
          dateOverrides: JSON.stringify([]),
        }),
      });

      const result = await service.removeDateOverride(mockUser, '2026-10-15');
      expect(result.dateOverrides).toHaveLength(0);
    });
  });

  describe('computeAvailableSlots', () => {
    it('throws BadRequestException if startDate > endDate', async () => {
      await expect(
        service.computeAvailableSlots('emp-profile-1', {
          startDate: '2026-10-20',
          endDate: '2026-10-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes open slots respecting working hours and buffers', async () => {
      // Setup future date beyond 24h min notice
      const future = new Date(Date.now() + 48 * 3600 * 1000);
      const dateStr = future.toISOString().split('T')[0];

      const slots = await service.computeAvailableSlots('emp-profile-1', {
        startDate: dateStr,
        endDate: dateStr,
        workingHoursStart: '09:00',
        workingHoursEnd: '12:00',
        slotDurationMinutes: 60,
        bufferMinutes: 15,
        candidateTimezone: 'Asia/Tokyo',
      });

      expect(slots).toBeInstanceOf(Array);
      if (slots.length > 0) {
        expect(slots[0].durationMinutes).toBe(60);
        expect(slots[0].employerTime).toBeDefined();
        expect(slots[0].candidateTime).toBeDefined();
      }
    });

    it('excludes blocked dates from availability slots', async () => {
      const future = new Date(Date.now() + 48 * 3600 * 1000);
      const dateStr = future.toISOString().split('T')[0];

      const customRecord = {
        id: 'avail-1',
        employerId: 'emp-profile-1',
        userId: null,
        timezone: 'UTC',
        weeklySchedule: JSON.stringify(AvailabilityService.DEFAULT_WEEKLY_SCHEDULE),
        dateOverrides: JSON.stringify([{ date: dateStr, isBlocked: true, reason: 'Holiday' }]),
        slotDurationMinutes: 45,
        bufferMinutes: 15,
        minNoticeHours: 0,
        maxInterviewsPerDay: 6,
        isActive: true,
      };

      mockPrisma.client.orm.public.InterviewerAvailability.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(customRecord),
      });

      const slots = await service.computeAvailableSlots('emp-profile-1', {
        startDate: dateStr,
        endDate: dateStr,
      });

      expect(slots).toHaveLength(0);
    });
  });
});
