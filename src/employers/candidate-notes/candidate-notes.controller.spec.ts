import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CandidateNotesController } from './candidate-notes.controller.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthUser } from '../../auth/auth.service.js';

describe('CandidateNotesController', () => {
  let controller: CandidateNotesController;
  let mockService: any;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: 'employer@acme.com',
    name: 'Employer User',
    role: Role.EMPLOYER,
    emailVerified: true,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockService = {
      createNote: vi.fn().mockResolvedValue({ id: 'note-1', content: 'Evaluation' }),
      listNotes: vi.fn().mockResolvedValue({ count: 1, notes: [] }),
      getNoteById: vi.fn().mockResolvedValue({ id: 'note-1', content: 'Evaluation' }),
      updateNote: vi.fn().mockResolvedValue({ id: 'note-1', content: 'Updated' }),
      deleteNote: vi.fn().mockResolvedValue({ success: true }),
      togglePinNote: vi.fn().mockResolvedValue({ id: 'note-1', isPinned: true }),
    };

    controller = new CandidateNotesController(mockService);
  });

  describe('createNote', () => {
    it('should delegate to notesService.createNote', async () => {
      const dto = { profileId: 'profile-1', content: 'Great match' };
      const res = await controller.createNote(mockUser, dto as any);
      expect(mockService.createNote).toHaveBeenCalledWith(mockUser, dto);
      expect(res.id).toBe('note-1');
    });
  });

  describe('listNotes', () => {
    it('should delegate to notesService.listNotes', async () => {
      const query = { category: 'general' };
      const res = await controller.listNotes(mockUser, 'profile-1', query as any);
      expect(mockService.listNotes).toHaveBeenCalledWith(mockUser, 'profile-1', query);
      expect(res.count).toBe(1);
    });
  });

  describe('getNoteById', () => {
    it('should delegate to notesService.getNoteById', async () => {
      const res = await controller.getNoteById(mockUser, 'note-1');
      expect(mockService.getNoteById).toHaveBeenCalledWith(mockUser, 'note-1');
      expect(res.id).toBe('note-1');
    });
  });

  describe('updateNote', () => {
    it('should delegate to notesService.updateNote', async () => {
      const dto = { content: 'Updated' };
      const res = await controller.updateNote(mockUser, 'note-1', dto);
      expect(mockService.updateNote).toHaveBeenCalledWith(mockUser, 'note-1', dto);
      expect(res?.content).toBe('Updated');
    });
  });

  describe('deleteNote', () => {
    it('should delegate to notesService.deleteNote', async () => {
      const res = await controller.deleteNote(mockUser, 'note-1');
      expect(mockService.deleteNote).toHaveBeenCalledWith(mockUser, 'note-1');
      expect(res.success).toBe(true);
    });
  });

  describe('togglePinNote', () => {
    it('should delegate to notesService.togglePinNote', async () => {
      const res = await controller.togglePinNote(mockUser, 'note-1');
      expect(mockService.togglePinNote).toHaveBeenCalledWith(mockUser, 'note-1');
      expect(res?.isPinned).toBe(true);
    });
  });
});
