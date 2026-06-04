import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCategoryStore } from './useCategoryStore';
import { useToastStore } from './useToastStore';
import { setIpc } from '../lib/ipc';
import { createMockElectronAPI } from '../test/mockElectronAPI';
import type { Category, CategoryInput, ElectronAPI } from '../types';

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: 'Food',
  type: 'expense',
  color: null,
  sortOrder: 0,
  ...overrides,
});

let ipc: ElectronAPI;

beforeEach(() => {
  ipc = createMockElectronAPI();
  setIpc(ipc);
  useCategoryStore.setState({ categories: [], loading: false });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setIpc(null);
  vi.restoreAllMocks();
});

describe('useCategoryStore', () => {
  describe('fetchCategories', () => {
    it('populates categories from the mocked IPC getCategories', async () => {
      const fetched = [makeCategory({ id: 1, name: 'Food' }), makeCategory({ id: 2, name: 'Rent' })];
      ipc.getCategories = vi.fn().mockResolvedValue(fetched);

      await useCategoryStore.getState().fetchCategories();

      expect(ipc.getCategories).toHaveBeenCalledTimes(1);
      expect(useCategoryStore.getState().categories).toEqual(fetched);
      expect(useCategoryStore.getState().loading).toBe(false);
    });

    it('clears loading and emits a toast when getCategories rejects', async () => {
      ipc.getCategories = vi.fn().mockRejectedValue(new Error('boom'));

      await useCategoryStore.getState().fetchCategories();

      expect(useCategoryStore.getState().loading).toBe(false);
      expect(useCategoryStore.getState().categories).toEqual([]);
      expect(useToastStore.getState().toasts.length).toBe(1);
      expect(useToastStore.getState().toasts[0].type).toBe('error');
    });
  });

  describe('addCategory', () => {
    it('appends the category returned by IPC', async () => {
      const existing = makeCategory({ id: 1, name: 'Food' });
      useCategoryStore.setState({ categories: [existing] });
      const created = makeCategory({ id: 2, name: 'Salary', type: 'income' });
      ipc.addCategory = vi.fn().mockResolvedValue(created);

      const input: CategoryInput = { name: 'Salary', type: 'income' };
      await useCategoryStore.getState().addCategory(input);

      expect(ipc.addCategory).toHaveBeenCalledWith(input);
      expect(useCategoryStore.getState().categories).toEqual([existing, created]);
    });

    it('leaves categories unchanged and emits a toast when addCategory rejects', async () => {
      const existing = makeCategory({ id: 1, name: 'Food' });
      useCategoryStore.setState({ categories: [existing] });
      ipc.addCategory = vi.fn().mockRejectedValue(new Error('boom'));

      await useCategoryStore.getState().addCategory({ name: 'Salary', type: 'income' });

      expect(useCategoryStore.getState().categories).toEqual([existing]);
      expect(useToastStore.getState().toasts.length).toBe(1);
      expect(useToastStore.getState().toasts[0].type).toBe('error');
    });
  });

  describe('deleteCategory', () => {
    it('optimistically removes the category on success', async () => {
      const a = makeCategory({ id: 1, name: 'Food' });
      const b = makeCategory({ id: 2, name: 'Rent' });
      useCategoryStore.setState({ categories: [a, b] });
      ipc.deleteCategory = vi.fn().mockResolvedValue(undefined);

      await useCategoryStore.getState().deleteCategory(1);

      expect(ipc.deleteCategory).toHaveBeenCalledWith(1);
      expect(useCategoryStore.getState().categories).toEqual([b]);
    });

    it('rolls back the optimistic removal and emits a toast when IPC rejects', async () => {
      const a = makeCategory({ id: 1, name: 'Food' });
      const b = makeCategory({ id: 2, name: 'Rent' });
      useCategoryStore.setState({ categories: [a, b] });
      ipc.deleteCategory = vi.fn().mockRejectedValue(new Error('boom'));

      const addToastSpy = vi.spyOn(useToastStore.getState(), 'addToast');

      await useCategoryStore.getState().deleteCategory(1);

      expect(useCategoryStore.getState().categories).toEqual([a, b]);
      expect(addToastSpy).toHaveBeenCalledTimes(1);
      expect(useToastStore.getState().toasts.length).toBe(1);
      expect(useToastStore.getState().toasts[0].type).toBe('error');
    });
  });

  describe('updateCategory', () => {
    it('optimistically merges the patch on success', async () => {
      const a = makeCategory({ id: 1, name: 'Food' });
      useCategoryStore.setState({ categories: [a] });
      ipc.updateCategory = vi.fn().mockResolvedValue(undefined);

      await useCategoryStore.getState().updateCategory(1, { name: 'Groceries' });

      expect(ipc.updateCategory).toHaveBeenCalledWith(1, { name: 'Groceries' });
      expect(useCategoryStore.getState().categories[0].name).toBe('Groceries');
    });

    it('rolls back the optimistic patch and emits a toast when IPC rejects', async () => {
      const a = makeCategory({ id: 1, name: 'Food' });
      useCategoryStore.setState({ categories: [a] });
      ipc.updateCategory = vi.fn().mockRejectedValue(new Error('boom'));

      await useCategoryStore.getState().updateCategory(1, { name: 'Groceries' });

      expect(useCategoryStore.getState().categories).toEqual([a]);
      expect(useToastStore.getState().toasts.length).toBe(1);
      expect(useToastStore.getState().toasts[0].type).toBe('error');
    });
  });
});
