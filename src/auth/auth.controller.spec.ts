import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let authController: AuthController;
  let authService: AuthService;

  const mockUser = {
    id: 'user-123',
    email: 'test@fruitful.example',
    name: 'Test Candidate',
    emailVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAuthService = {
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    vi.clearAllMocks();
  });

  it('should register a new user successfully', async () => {
    mockAuthService.register.mockResolvedValue({
      data: { user: mockUser, token: 'session-token' },
      setCookieHeaders: ['neon-auth.session_token=session-token; Path=/; HttpOnly'],
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const mockRes = { setHeader: vi.fn() } as any;

    const result = await authController.register(
      { email: 'test@fruitful.example', password: 'Password123!', name: 'Test Candidate' },
      mockReq,
      mockRes,
    );

    expect(result.success).toBe(true);
    expect(result.user.email).toBe('test@fruitful.example');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'neon-auth.session_token=session-token; Path=/; HttpOnly',
    ]);
  });

  it('should log in a user successfully', async () => {
    mockAuthService.login.mockResolvedValue({
      data: { user: mockUser, token: 'session-token' },
      setCookieHeaders: ['neon-auth.session_token=session-token; Path=/; HttpOnly'],
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const mockRes = { setHeader: vi.fn() } as any;

    const result = await authController.login(
      { email: 'test@fruitful.example', password: 'Password123!' },
      mockReq,
      mockRes,
    );

    expect(result.success).toBe(true);
    expect(result.user.id).toBe('user-123');
    expect(mockRes.setHeader).toHaveBeenCalled();
  });

  it('should log out a user successfully', async () => {
    mockAuthService.logout.mockResolvedValue({
      data: { success: true },
      setCookieHeaders: ['neon-auth.session_token=; Max-Age=0; Path=/'],
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const mockRes = { setHeader: vi.fn() } as any;

    const result = await authController.logout(
      mockReq,
      mockRes,
      'http://localhost:3000',
      'neon-auth.session_token=session-token',
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Logged out successfully.');
    expect(mockRes.setHeader).toHaveBeenCalled();
  });

  it('should handle forgot password request', async () => {
    mockAuthService.forgotPassword.mockResolvedValue({
      message: 'Reset link sent.',
      status: true,
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.forgotPassword(
      { email: 'test@fruitful.example' },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Reset link sent.');
  });

  it('should handle reset password request', async () => {
    mockAuthService.resetPassword.mockResolvedValue({
      message: 'Password reset successful.',
      status: true,
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.resetPassword(
      { token: 'valid-token', newPassword: 'NewPassword123!' },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Password reset successful.');
  });

  it('should retrieve active session', async () => {
    mockAuthService.getSession.mockResolvedValue({
      user: mockUser,
      session: { id: 'sess-1', userId: 'user-123', token: 'token' },
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.getSession(
      mockReq,
      'http://localhost:3000',
      'cookie',
      'Bearer token',
    );

    expect(result.authenticated).toBe(true);
    expect(result.user.email).toBe('test@fruitful.example');
  });
});
