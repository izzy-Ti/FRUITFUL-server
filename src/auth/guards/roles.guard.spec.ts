import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import { Role } from '../../common/enums/role.enum.js';

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no roles are defined', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext();

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has the required role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.JOB_SEEKER]);
    const context = createMockContext({ id: 'u1', role: Role.JOB_SEEKER });

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has one of several required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.EMPLOYER, Role.ADMIN]);
    const context = createMockContext({ id: 'u2', role: Role.ADMIN });

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user is not attached to request', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.JOB_SEEKER]);
    const context = createMockContext(undefined);

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user has no role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.JOB_SEEKER]);
    const context = createMockContext({ id: 'u3' });

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user role does not match required roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const context = createMockContext({ id: 'u4', role: Role.JOB_SEEKER });

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });
});
