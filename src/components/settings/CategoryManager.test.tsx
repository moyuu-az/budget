import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryManager from './CategoryManager';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useToastStore } from '../../stores/useToastStore';
import type { AppApi, Category } from '../../types';

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 1,
  name: '住居費',
  type: 'expense',
  color: '#8b5cf6',
  sortOrder: 0,
  costType: null,
  ...overrides,
});

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useCategoryStore.setState({ categories: [], loading: false });
  useTemplateStore.setState({ templates: [] });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('固定費 / 変動費', () => {
  it('offers the classification for expenses only', async () => {
    // The database refuses cost_type on an income category, so offering the
    // control there would be offering an error.
    const user = userEvent.setup();
    render(<CategoryManager />);

    expect(screen.getByLabelText('費目')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('種別'), 'income');
    expect(screen.queryByLabelText('費目')).not.toBeInTheDocument();
  });

  it('sends the chosen classification when adding an expense category', async () => {
    const user = userEvent.setup();
    api.addCategory = vi.fn().mockResolvedValue(category({ id: 2, costType: 'fixed' }));
    render(<CategoryManager />);

    await user.type(screen.getByPlaceholderText('カテゴリ名'), '住居費');
    await user.selectOptions(screen.getByLabelText('費目'), 'fixed');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(api.addCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: '住居費', type: 'expense', costType: 'fixed' }),
    );
  });

  it('never sends a classification for income', async () => {
    const user = userEvent.setup();
    api.addCategory = vi.fn().mockResolvedValue(category({ id: 2, type: 'income' }));
    render(<CategoryManager />);

    await user.selectOptions(screen.getByLabelText('種別'), 'income');
    await user.type(screen.getByPlaceholderText('カテゴリ名'), '給与');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(api.addCategory).toHaveBeenCalledWith(expect.objectContaining({ costType: null }));
  });

  it('labels an expense category that nobody has classified yet', () => {
    // An absent badge would read as "no such concept here" rather than "not
    // decided".
    useCategoryStore.setState({ categories: [category({ costType: null })] });
    render(<CategoryManager />);
    // Scoped to the badge: 未分類 is also one of the form's select options.
    expect(screen.getByText('未分類', { selector: 'span' })).toBeInTheDocument();
  });

  it('saves the classification from the row editor', async () => {
    const user = userEvent.setup();
    useCategoryStore.setState({ categories: [category({ costType: null })] });
    api.updateCategory = vi.fn().mockResolvedValue(undefined);
    render(<CategoryManager />);

    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.selectOptions(screen.getByLabelText('住居費の費目'), 'variable');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(api.updateCategory).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ costType: 'variable' }),
    );
  });
});

describe('failure reporting', () => {
  it('does not claim success when the server refused the change', async () => {
    // Regression: the call site used to wrap a store action in try/catch, but
    // the store swallows the throw -- so the catch never ran and 「追加しました」
    // appeared even though nothing was added.
    const user = userEvent.setup();
    api.addCategory = vi.fn().mockRejectedValue(new Error('boom'));
    render(<CategoryManager />);

    await user.type(screen.getByPlaceholderText('カテゴリ名'), '住居費');
    await user.click(screen.getByRole('button', { name: '追加' }));

    const toasts = useToastStore.getState().toasts;
    expect(toasts.map((t) => t.type)).toEqual(['error']);
    // The typed name survives, so the add can be retried rather than retyped.
    expect(screen.getByPlaceholderText('カテゴリ名')).toHaveValue('住居費');
  });
});
