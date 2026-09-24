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
    sendVerificationEmail: vi.fn(),
    sendVerificationOtp: vi.fn(),
    verifyEmail: vi.fn(),
    initiateGoogleAuth: vi.fn(),
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

  it('should send verification email', async () => {
    mockAuthService.sendVerificationEmail.mockResolvedValue({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.sendVerificationEmail(
      { email: 'test@fruitful.example' },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Verification email sent');
  });

  it('should send verification OTP', async () => {
    mockAuthService.sendVerificationOtp.mockResolvedValue({
      success: true,
      message: 'Verification code sent.',
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.sendVerificationOtp(
      { email: 'test@fruitful.example' },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Verification code sent.');
  });

  it('should verify email with token', async () => {
    mockAuthService.verifyEmail.mockResolvedValue({
      success: true,
      message: 'Email successfully verified.',
      user: { ...mockUser, emailVerified: true },
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.verifyEmail(
      { token: 'valid-verify-token' },
      mockReq,
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Email successfully verified.');
  });

  it('should initiate Google OAuth and redirect by default', async () => {
    mockAuthService.initiateGoogleAuth.mockResolvedValue({
      url: 'https://oauth2.google.com/auth?...',
      redirect: true,
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const mockRes = { redirect: vi.fn(), json: vi.fn() } as any;

    await authController.googleAuth(undefined, undefined, mockReq, mockRes);

    expect(mockRes.redirect).toHaveBeenCalledWith('https://oauth2.google.com/auth?...');
  });

  it('should return Google OAuth url as JSON when requested', async () => {
    mockAuthService.initiateGoogleAuth.mockResolvedValue({
      url: 'https://oauth2.google.com/auth?...',
      redirect: true,
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;
    const mockRes = { redirect: vi.fn(), json: vi.fn() } as any;

    await authController.googleAuth(undefined, 'false', mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({ url: 'https://oauth2.google.com/auth?...' });
  });

  it('should handle OAuth callback', async () => {
    mockAuthService.getSession.mockResolvedValue({
      user: mockUser,
      session: { id: 'sess-oauth', userId: 'user-123' },
    });

    const mockReq = { headers: { host: 'localhost:3000' } } as any;

    const result = await authController.oauthCallback(
      mockReq,
      'http://localhost:3000',
      'cookie',
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('OAuth sign-in completed successfully');
  });

  describe('Role-protected endpoints', () => {
    it('should return job seeker resource', () => {
      const mockReq = { user: { id: 'u1', role: 'job_seeker' } } as any;
      const res = authController.getJobSeekerResource(mockReq);
      expect(res.message).toContain('Job Seeker resource');
      expect(res.user.role).toBe('job_seeker');
    });

    it('should return employer resource', () => {
      const mockReq = { user: { id: 'u2', role: 'employer' } } as any;
      const res = authController.getEmployerResource(mockReq);
      expect(res.message).toContain('Employer resource');
      expect(res.user.role).toBe('employer');
    });

    it('should return admin resource', () => {
      const mockReq = { user: { id: 'u3', role: 'admin' } } as any;
      const res = authController.getAdminResource(mockReq);
      expect(res.message).toContain('Admin resource');
      expect(res.user.role).toBe('admin');
    });
  });
});
