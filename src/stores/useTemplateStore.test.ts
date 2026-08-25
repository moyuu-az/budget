import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTemplateStore } from './useTemplateStore';
import { setApi } from '../lib/api';
import { createMockApi } from '../test/mock-api';
import { useToastStore } from '../stores/useToastStore';
import { makeTemplate, monthlyOn, yearlyOn } from '../test/factories';
import type { AppApi } from '../types';

// ---------------------------------------------------------------------------
// What a caller learns when a save fails.
//
// These actions used to return void and swallow the throw, so every call site's
// try/catch was unreachable: the form closed and said 「更新しました」 beside the
// error toast, for a save that did not happen. The boolean is what makes the
// difference visible to a caller without raising a second message.
// ---------------------------------------------------------------------------

let api: AppApi;

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useTemplateStore.setState({ templates: [], status: 'ready' });
  useToastStore.setState({ toasts: [], queue: [] });
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('addTemplate', () => {
  it('returns true and appends the server’s row', async () => {
    const created = makeTemplate({ id: 7, name: '家賃' });
    api.addTemplate = vi.fn().mockResolvedValue(created);

    const ok = await useTemplateStore.getState().addTemplate({
      name: '家賃', recurrence: monthlyOn(27), type: 'expense',
    });

    expect(ok).toBe(true);
    expect(useTemplateStore.getState().templates).toEqual([created]);
  });

  it('returns false and adds nothing when the server refuses', async () => {
    api.addTemplate = vi.fn().mockRejectedValue(new Error('nope'));

    const ok = await useTemplateStore.getState().addTemplate({
      name: '家賃', recurrence: monthlyOn(27), type: 'expense',
    });

    expect(ok).toBe(false);
    expect(useTemplateStore.getState().templates).toEqual([]);
  });
});

describe('updateTemplate', () => {
  const original = makeTemplate({ id: 1, name: '車検', recurrence: yearlyOn(3, 20) });

  beforeEach(() => {
    useTemplateStore.setState({ templates: [original], status: 'ready' });
  });

  it('REPLACES the recurrence rather than merging into it', async () => {
    // A half-merged union -- a 'monthly' still carrying `month` -- is a shape
    // neither the predicates nor the database CHECK accept.
    api.updateTemplate = vi.fn().mockResolvedValue(undefined);

    const ok = await useTemplateStore.getState().updateTemplate(1, { recurrence: monthlyOn(5) });

    expect(ok).toBe(true);
    expect(useTemplateStore.getState().templates[0].recurrence).toEqual({
      kind: 'monthly',
      dayOfMonth: 5,
    });
  });

  it('returns false and rolls the optimistic edit back on failure', async () => {
    api.updateTemplate = vi.fn().mockRejectedValue(new Error('nope'));

    const ok = await useTemplateStore.getState().updateTemplate(1, { recurrence: monthlyOn(5) });

    expect(ok).toBe(false);
    expect(useTemplateStore.getState().templates[0].recurrence).toEqual(original.recurrence);
  });
});

describe('deleteTemplate', () => {
  beforeEach(() => {
    useTemplateStore.setState({ templates: [makeTemplate({ id: 1 })], status: 'ready' });
  });

  it('returns true and removes the row', async () => {
    api.deleteTemplate = vi.fn().mockResolvedValue(undefined);
    expect(await useTemplateStore.getState().deleteTemplate(1)).toBe(true);
    expect(useTemplateStore.getState().templates).toEqual([]);
  });

  it('returns false and puts the row back on failure', async () => {
    api.deleteTemplate = vi.fn().mockRejectedValue(new Error('nope'));
    expect(await useTemplateStore.getState().deleteTemplate(1)).toBe(false);
    expect(useTemplateStore.getState().templates).toHaveLength(1);
  });
});

describe('toggleTemplate', () => {
  beforeEach(() => {
    useTemplateStore.setState({ templates: [makeTemplate({ id: 1, enabled: true })], status: 'ready' });
  });

  it('returns false and restores the switch on failure', async () => {
    // The switch snapping back IS the feedback. Without the rollback it would
    // sit in a position the server never accepted.
    api.toggleTemplate = vi.fn().mockRejectedValue(new Error('nope'));

    expect(await useTemplateStore.getState().toggleTemplate(1, false)).toBe(false);
    expect(useTemplateStore.getState().templates[0].enabled).toBe(true);
  });
});

describe('fetchTemplates', () => {
  it('reports an error as its own state, not as a longer wait', async () => {
    // Folded into "not ready" it becomes a skeleton that pulses forever, with
    // nothing saying what happened or offering to try again.
    api.getTemplates = vi.fn().mockRejectedValue(new Error('nope'));

    await useTemplateStore.getState().fetchTemplates();

    expect(useTemplateStore.getState().status).toBe('error');
  });
});
