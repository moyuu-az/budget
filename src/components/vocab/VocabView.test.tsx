import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VocabView from './VocabView';
import { setApi } from '../../lib/api';
import { createMockApi } from '../../test/mock-api';
import { useVocabStore } from '../../stores/useVocabStore';
import { useToastStore } from '../../stores/useToastStore';
import { wordById, wordsForDay } from '../../../shared/vocabulary';
import type { AppApi, VocabAttemptInput, VocabProgress } from '../../types';

// ---------------------------------------------------------------------------
// These tests drive the screen the way somebody studying would, because the
// defects that matter here are not rendering ones:
//
//   - an answer that can be changed after the correct one is shown,
//   - a run that is reported as recorded when the request failed,
//   - 「間違えた問題だけ」 asking about words that were never got wrong.
//
// Each of those looks fine on screen and corrupts what the reader believes.
// ---------------------------------------------------------------------------

let api: AppApi;

const NEVER_ANSWERED = { attempts: 0, correct: 0, lastCorrect: null, lastAnsweredAt: null } as const;

/**
 * One word's record, answered once in ONE direction.
 *
 * The direction is explicit because the review set is per direction: a word
 * failed 英→日 is not in the 日→英 review set, and a fixture that ignored that
 * would set up a quiz the screen correctly refuses to start.
 */
const at = (
  wordId: string,
  lastCorrect: boolean,
  direction: 'en_to_ja' | 'ja_to_en' = 'en_to_ja',
): VocabProgress[number] => ({
  wordId,
  byDirection: {
    en_to_ja: NEVER_ANSWERED,
    ja_to_en: NEVER_ANSWERED,
    [direction]: {
      attempts: 1,
      correct: lastCorrect ? 1 : 0,
      lastCorrect,
      lastAnsweredAt: '2026-09-05T00:00:00.000Z',
    },
  },
});

/** Puts the address in a known state; the screen reads its settings from it. */
const goTo = (query: string): void => {
  window.history.replaceState(null, '', `/vocab${query}`);
};

beforeEach(() => {
  api = createMockApi();
  setApi(api);
  useVocabStore.setState({ progress: [], status: 'ready', saving: false });
  useToastStore.setState({ toasts: [], queue: [] });
  goTo('');
});

afterEach(() => {
  setApi(null);
  vi.restoreAllMocks();
});

describe('英単語 の設定', () => {
  it('reads the Day, direction and scope from the address', async () => {
    goTo('?day=33&dir=ja_to_en&scope=all');
    render(<VocabView />);

    // Day 33 is 「動詞句6」. If the address were ignored the screen would open on
    // Day 31 and the reader's bookmark would be a lie.
    expect(await screen.findByText(/Day 33・すべて・16問/)).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: '出題の向き' });
    expect(within(tabs).getByRole('tab', { name: '日本語 → 英語' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('falls back instead of trusting a hand-edited address', async () => {
    // `?day=99` names a Day that does not exist. Honouring it would render an
    // empty quiz under a heading nobody wrote.
    goTo('?day=99&dir=sideways&scope=nonsense');
    render(<VocabView />);
    expect(await screen.findByText(/Day 31・すべて・16問/)).toBeInTheDocument();
  });

  it('writes the chosen Day back to the address so the screen can be shared', async () => {
    const user = userEvent.setup();
    render(<VocabView />);

    await user.click(await screen.findByRole('button', { name: /Day 34/ }));
    expect(new URLSearchParams(window.location.search).get('day')).toBe('34');
  });

  it('refuses 「間違えた問題だけ」 when nothing is wrong, rather than starting an empty quiz', async () => {
    render(<VocabView />);
    const scopes = await screen.findByRole('tablist', { name: '出題範囲' });
    expect(within(scopes).getByRole('tab', { name: '間違えた問題だけ' })).toBeDisabled();
  });

  it('offers 「間違えた問題だけ」 once something has been failed, and asks only those', async () => {
    const user = userEvent.setup();
    useVocabStore.setState({
      progress: [at('et-481', false), at('et-482', true)],
      status: 'ready',
    });
    goTo('?day=31&dir=en_to_ja');
    render(<VocabView />);

    const scopes = await screen.findByRole('tablist', { name: '出題範囲' });
    await user.click(within(scopes).getByRole('tab', { name: '間違えた問題だけ' }));

    // One word was failed; the word answered correctly is NOT in the set, even
    // though 「間違えた問題だけ」 on a fresh account would otherwise quietly mean
    // 「全部」.
    expect(await screen.findByText(/Day 31・間違えた問題だけ・1問/)).toBeInTheDocument();
  });
});

describe('クイズを解く', () => {
  /** Starts a one-question quiz over a Day whose other words were answered. */
  async function startSingleQuestion(user: ReturnType<typeof userEvent.setup>) {
    const day31 = wordsForDay(31);
    // Everything except the first word is already right, so 'wrong' selects one.
    useVocabStore.setState({
      progress: [at(day31[0].id, false)],
      status: 'ready',
    });
    goTo('?day=31&dir=en_to_ja&scope=wrong');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));
    return day31[0];
  }

  it('shows the English and asks for the Japanese', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    expect(await screen.findByText(word.en)).toBeInTheDocument();
    expect(screen.getByText('英語 → 日本語')).toBeInTheDocument();
    expect(screen.getByText('1 / 1 問目・ここまで 0問正解')).toBeInTheDocument();
  });

  it('reveals the explanation and the example after an answer, not before', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    // Before answering, the reveal must not be on screen -- it contains the
    // meaning, which is the answer.
    expect(screen.queryByText('解説')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: word.ja }));

    expect(await screen.findByText('解説')).toBeInTheDocument();
    expect(screen.getByText('ワンポイント・アドバイス')).toBeInTheDocument();
    expect(screen.getByText(word.note)).toBeInTheDocument();
    expect(screen.getByText(word.tip)).toBeInTheDocument();
    expect(screen.getByText(word.example.en)).toBeInTheDocument();
    expect(screen.getByText(word.example.ja)).toBeInTheDocument();
  });

  it('locks the answer once given', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    const wrong = choices.find((button) => button.textContent?.includes(word.ja) === false)!;
    await user.click(wrong);

    // An answer that can be changed after the correct one is shown records what
    // the reader could SEE, not what they knew -- and 「間違えた問題だけ」 is
    // built entirely on that record.
    for (const choice of choices) expect(choice).toBeDisabled();
    expect(await screen.findByText('不正解')).toBeInTheDocument();
  });

  it('records the whole run once, with the direction of each question', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.ja }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(1);
    expect(api.recordVocabAttempts).toHaveBeenCalledWith([
      { wordId: word.id, direction: 'en_to_ja', correct: true } satisfies VocabAttemptInput,
    ]);
  });

  it('advances once when Enter is pressed on the focused 次へ button', async () => {
    // A <button> turns Enter into a click, and a window-level handler that also
    // acts on Enter makes one keypress advance twice. On the last question that
    // submits the whole run to the server a SECOND time, doubling every attempt
    // in the study record -- with nothing on screen to show it.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.ja }));
    const next = await screen.findByRole('button', { name: '結果を見る' });
    next.focus();
    await user.keyboard('{Enter}');

    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(1);
  });

  it('advances from the keyboard when nothing is focused', async () => {
    // The shortcut still has to work -- the guard above must not disable it for
    // a reader who never touches the mouse.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.ja }));
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Enter}');

    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('結果')).toBeInTheDocument();
  });

  it('picks a choice with the number keys', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    const slot = choices.findIndex((b) => b.textContent?.includes(word.ja));
    await user.keyboard(String(slot + 1));

    expect(await screen.findByText('正解')).toBeInTheDocument();
  });

  it('says so when the run could not be recorded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockRejectedValue(new Error('offline'));
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.ja }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    // Showing only the score would let the reader move on believing their review
    // list had been updated with the words they just got wrong.
    expect(await screen.findByText('この結果は記録できませんでした')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'もう一度記録する' })).toBeInTheDocument();
  });

  it('does not offer 「間違えた問題をもう一度」 on a run that was never recorded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockRejectedValue(new Error('offline'));
    const word = await startSingleQuestion(user);

    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    await user.click(choices.find((b) => b.textContent?.includes(word.ja) === false)!);
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    // The set would be rebuilt from a record the server never received, so the
    // reader would be told they had fixed words the stored progress still calls
    // wrong.
    expect(await screen.findByText('この結果は記録できませんでした')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '間違えた問題をもう一度' }),
    ).not.toBeInTheDocument();
  });

  it('lists what was missed, with the advice for each', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    await user.click(choices.find((b) => b.textContent?.includes(word.ja) === false)!);
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    expect(await screen.findByText('間違えた 1問')).toBeInTheDocument();
    expect(screen.getByText(wordById(word.id)!.jaFull)).toBeInTheDocument();
  });

  it('never offers a choice that would also be correct', async () => {
    // 541 be glad to do and 542 be happy to do share their Japanese. Asked
    // 「〜してうれしい」→英語 with both on screen, the reader has two right
    // answers and is marked wrong for picking one.
    const user = userEvent.setup();
    useVocabStore.setState({ progress: [at('et-541', false, 'ja_to_en')], status: 'ready' });
    goTo('?day=34&dir=ja_to_en&scope=wrong');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    const texts = screen
      .getAllByRole('listitem')
      .map((li) => within(li).getByRole('button').textContent ?? '');
    expect(texts.some((t) => t.includes('be glad to do'))).toBe(true);
    expect(texts.some((t) => t.includes('be happy to do'))).toBe(false);
  });
});

describe('学習記録', () => {
  it('shows a dash rather than 0% before anything has been answered', async () => {
    render(<VocabView />);
    // 0% and "not started" look identical as a number and mean opposite things.
    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText('0 / 80')).toBeInTheDocument();
  });

  it('clears one Day on request, and leaves the button off when there is nothing to clear', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetVocabProgress).mockResolvedValue([]);

    render(<VocabView />);
    expect(await screen.findByRole('button', { name: /Day 31 の記録を消す/ })).toBeDisabled();

    // Wrapped: this is an external store pushing into a mounted tree, which is
    // exactly what act() is for.
    act(() => {
      useVocabStore.setState({ progress: [at('et-481', true)], status: 'ready' });
    });
    await user.click(await screen.findByRole('button', { name: /Day 31 の記録を消す/ }));
    expect(api.resetVocabProgress).toHaveBeenCalledWith(31);
  });

  it('shows the failure instead of an empty record when the load fails', async () => {
    useVocabStore.setState({ progress: [], status: 'error' });
    render(<VocabView />);
    expect(await screen.findByText(/学習記録を読み込めませんでした/)).toBeInTheDocument();
  });
});
