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
  direction: 'en_to_ja' | 'ja_to_en' = 'ja_to_en',
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
  it('reads the Day and scope from the address', async () => {
    goTo('?day=33&scope=all');
    render(<VocabView />);

    // Day 33 is 「動詞句6」. If the address were ignored the screen would open on
    // Day 31 and the reader's bookmark would be a lie.
    expect(await screen.findByText(/Day 33・すべて・手入力・/)).toBeInTheDocument();
  });

  it('asks only 日本語 → 英語 for now', async () => {
    // The other direction is switched off at the offer, not removed from the
    // contract: marking free-text Japanese against a printed gloss can be wrong
    // about a reader who knew the answer, and a wrong one lands in
    // 「間違えた問題だけ」.
    render(<VocabView />);
    expect(await screen.findByText(/日本語 → 英語・Day 31/)).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '出題の向き' })).not.toBeInTheDocument();
  });

  it('falls back instead of trusting a hand-edited address', async () => {
    // `?day=99` names a Day that does not exist. Honouring it would render an
    // empty quiz under a heading nobody wrote.
    goTo('?day=99&scope=nonsense&input=telepathy&order=alphabetical');
    render(<VocabView />);
    expect(await screen.findByText(/Day 31・すべて・手入力・ランダム・16問/)).toBeInTheDocument();
  });

  it('reads the 出題順 from the address, and the tab says so', async () => {
    goTo('?day=31&order=number');
    render(<VocabView />);

    expect(await screen.findByText(/Day 31・すべて・手入力・No\.順・16問/)).toBeInTheDocument();
    // The selected state is asserted separately from the summary line because
    // they are two different lies a control can tell. Pinning `value={order}`
    // to a constant leaves the summary correct and highlights the wrong tab --
    // a reader who arrived on `?order=number` would see 「ランダム」 selected and
    // switch it, turning No.順 off.
    const orders = screen.getByRole('tablist', { name: '出題順' });
    expect(within(orders).getByRole('tab', { name: 'No.順' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('never greys out 出題順, whatever the 出題範囲 selected', async () => {
    // 「苦手」 ranks its ten words by how often each is missed, which makes it
    // tempting to grey this out. The ranking chose WHICH ten; it never reached
    // the screen (buildQuiz has always shuffled what it was handed), so No.順
    // here is the only statement about the order the reader actually sees.
    // The comment in VocabView says exactly that -- this is what stops it from
    // being a comment somebody can quietly contradict.
    useVocabStore.setState({ progress: [at('et-481', false)], status: 'ready' });
    goTo('?day=31&scope=weak');
    render(<VocabView />);

    const orders = await screen.findByRole('tablist', { name: '出題順' });
    for (const label of ['ランダム', 'No.順']) {
      expect(within(orders).getByRole('tab', { name: label })).toBeEnabled();
    }
  });

  it('defaults to ランダム, so a bookmark made before the option keeps its behaviour', async () => {
    // No `?order=` at all -- which is every link anybody saved before this
    // control existed. Defaulting to No.順 would silently change what those
    // links do.
    goTo('?day=31');
    render(<VocabView />);

    expect(await screen.findByText(/Day 31・すべて・手入力・ランダム・16問/)).toBeInTheDocument();
  });

  it('writes the chosen 出題順 back to the address', async () => {
    const user = userEvent.setup();
    render(<VocabView />);

    const orders = await screen.findByRole('tablist', { name: '出題順' });
    await user.click(within(orders).getByRole('tab', { name: 'No.順' }));

    expect(new URLSearchParams(window.location.search).get('order')).toBe('number');
    expect(await screen.findByText(/・No\.順・/)).toBeInTheDocument();
  });

  /**
   * What the first question of the running quiz is showing.
   *
   * Located through the direction line rather than by matching the word's own
   * text: the book prints the SAME Japanese for different English (541/542,
   * 553/560, 557/559), so `findByText(word.ja)` is one twin arriving at the top
   * of a Day away from failing with 「複数マッチ」 for a reason that has nothing
   * to do with the order being tested.
   */
  const currentPrompt = async (): Promise<Element> => {
    const direction = await screen.findByText('日本語 → 英語');
    const prompt = direction.nextElementSibling;
    if (prompt === null) throw new Error('the question shows no prompt beside its direction');
    return prompt;
  };

  // END TO END, because the wiring is what breaks: the setting is read from the
  // address, carried into buildQuiz, and only then decides what the reader is
  // shown. A unit test of buildQuiz passes happily while the screen forgets to
  // pass the option at all.
  //
  // TWO DAYS, and that is not padding. A screen that dropped the setting would
  // start a RANDOM run, whose first question is the Day's first entry one time
  // in sixteen -- often enough for a single-Day check to wave the defect
  // through. Requiring both makes that one time in 256.
  it.each([31, 35])('asks Day %i from its first entry when No.順 is chosen', async (day) => {
    const user = userEvent.setup();
    goTo(`?day=${day}&order=number&input=choice`);
    render(<VocabView />);

    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    expect(await currentPrompt()).toHaveTextContent(wordsForDay(day)[0].ja);
  });

  // --- CHOOSING ON THE CONTROL, NOT IN THE ADDRESS -------------------------
  //
  // Every test above puts the setting in the URL before the first render, so
  // the closure `start` captures is already correct and the dependency list is
  // never exercised. The reader does not arrive that way: they open /vocab,
  // press a tab, then press 「クイズを始める」. Drop a setting from `start`'s
  // dependencies and THAT path silently runs the previous setting while the
  // screen shows the new one -- and nothing above notices.
  //
  // Day is covered alongside 出題順 because the hole is the dependency list
  // itself, not this PR's setting: `dayId` could be dropped just as quietly.

  it('starts with the 出題順 picked on the control, not the one it opened with', async () => {
    const user = userEvent.setup();
    goTo('?day=31&input=choice');
    render(<VocabView />);

    const orders = await screen.findByRole('tablist', { name: '出題順' });
    await user.click(within(orders).getByRole('tab', { name: 'No.順' }));
    await user.click(screen.getByRole('button', { name: 'クイズを始める' }));

    expect(await currentPrompt()).toHaveTextContent(wordsForDay(31)[0].ja);
  });

  it('starts on the Day picked on the cards, not the one it opened with', async () => {
    const user = userEvent.setup();
    goTo('?day=31&order=number&input=choice');
    render(<VocabView />);

    await user.click(await screen.findByRole('button', { name: /Day 35/ }));
    await user.click(screen.getByRole('button', { name: 'クイズを始める' }));

    expect(await currentPrompt()).toHaveTextContent(wordsForDay(35)[0].ja);

    // AND THE CHOICES, which is where a stale `dayId` actually shows.
    //
    // The words to ask are passed in as an argument, so they follow the cards
    // even from a stale closure -- the prompt above would look right. What is
    // read from the closure is `distractorPool: wordsForDay(dayId)`, so a stale
    // Day quietly draws the wrong options: choices from another grammatical
    // pattern can be told apart by their shape, and the question stops being
    // about the meaning.
    // Counted through accessible names rather than textContent: each option
    // carries a keyboard-shortcut badge that is `aria-hidden`, so the raw text
    // reads 「1be filled with」 while the name a reader hears is the phrase.
    const choiceCount = screen.getAllByRole('listitem').length;
    const fromDay35 = wordsForDay(35).filter(
      (word) => screen.queryByRole('button', { name: word.en }) !== null,
    ).length;

    expect(choiceCount).toBe(4);
    expect(fromDay35).toBe(4);
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

  it('says why 「間違えた問題だけ」 is unavailable once the Day has been answered', async () => {
    // THE BUG THIS PINS. A greyed-out control beside a percentage below 100
    // reads as broken, and the reader was right to think something did not add
    // up -- the two numbers were computed on different bases. The control is
    // still disabled (an empty quiz is worse), but the screen now says what
    // happened: the words WERE missed, and were then revised correctly.
    useVocabStore.setState({
      // Missed once, revised correctly: the lifetime ratio remembers the miss,
      // the review set does not.
      progress: wordsForDay(31).map((word) => ({
        wordId: word.id,
        byDirection: {
          en_to_ja: NEVER_ANSWERED,
          ja_to_en: {
            attempts: 2,
            correct: 1,
            lastCorrect: true,
            lastAnsweredAt: '2026-09-05T00:00:00.000Z',
          },
        },
      })),
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    expect(
      await screen.findByText(/このDayに間違えたままの問題はありません/),
    ).toBeInTheDocument();
  });

  it('leads with a figure that agrees with 要復習, not with the lifetime ratio', async () => {
    // 定着 is computed on the same basis as the review set, so 100% and
    // 「要復習 0語」 are one statement. The lifetime ratio is still reported --
    // beside the answer count it comes from, labelled 通算 -- because it is a
    // real fact, just not the one that belongs at the top of a study screen.
    useVocabStore.setState({
      progress: wordsForDay(31).map((word) => ({
        wordId: word.id,
        byDirection: {
          en_to_ja: NEVER_ANSWERED,
          ja_to_en: {
            attempts: 2,
            correct: 1,
            lastCorrect: true,
            lastAnsweredAt: '2026-09-05T00:00:00.000Z',
          },
        },
      })),
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    expect(await screen.findByText('定着')).toBeInTheDocument();
    // 16 of 80 words answered, every one of them last answered correctly.
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('0語')).toBeInTheDocument();
    // …while the lifetime ratio, which is what made the screen look broken, is
    // demoted rather than deleted.
    expect(screen.getByText(/通算正答率 50%/)).toBeInTheDocument();
  });

  it('offers 「苦手」 when everything has been revised and 「間違えた問題だけ」 is empty', async () => {
    // THE STATE THIS MODE WAS ADDED FOR. The reader missed things, went back and
    // fixed them all, and 「間違えた問題だけ」 correctly has nothing left -- while
    // they can still name the phrases that keep catching them out.
    const user = userEvent.setup();
    useVocabStore.setState({
      progress: [
        // Missed twice, answered correctly last time.
        {
          wordId: 'et-481',
          byDirection: {
            en_to_ja: NEVER_ANSWERED,
            ja_to_en: {
              attempts: 3,
              correct: 1,
              lastCorrect: true,
              lastAnsweredAt: '2026-09-05T00:00:00.000Z',
            },
          },
        },
        // Never missed: must NOT be asked.
        at('et-482', true),
      ],
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    const scopes = await screen.findByRole('tablist', { name: '出題範囲' });
    expect(within(scopes).getByRole('tab', { name: '間違えた問題だけ' })).toBeDisabled();

    const weak = within(scopes).getByRole('tab', { name: '苦手' });
    expect(weak).toBeEnabled();
    await user.click(weak);

    expect(await screen.findByText(/Day 31・苦手・手入力・ランダム・1問/)).toBeInTheDocument();
  });

  it('refuses 「苦手」 on a Day where nothing has ever been missed', async () => {
    // Unlike 「間違えた問題だけ」 this does not empty when the reader revises, so
    // the only way it is empty is that there is no history to draw on.
    useVocabStore.setState({ progress: [at('et-481', true)], status: 'ready' });
    goTo('?day=31');
    render(<VocabView />);

    const scopes = await screen.findByRole('tablist', { name: '出題範囲' });
    expect(within(scopes).getByRole('tab', { name: '苦手' })).toBeDisabled();
  });

  it('points at 「苦手」 rather than saying there is nothing to do', async () => {
    // The note under the tabs used to end at 「次に間違えたときに選べます」, which
    // on a fully-revised Day is 「今日はやることがありません」 -- true of one
    // control and false of the screen.
    useVocabStore.setState({
      progress: [
        {
          wordId: 'et-481',
          byDirection: {
            en_to_ja: NEVER_ANSWERED,
            ja_to_en: {
              attempts: 3,
              correct: 1,
              lastCorrect: true,
              lastAnsweredAt: '2026-09-05T00:00:00.000Z',
            },
          },
        },
      ],
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    expect(await screen.findByText(/「苦手」を選んでください/)).toBeInTheDocument();
  });

  it('reads 「苦手」 from the address, so the mode survives a reload', async () => {
    useVocabStore.setState({
      progress: [
        {
          wordId: 'et-481',
          byDirection: {
            en_to_ja: NEVER_ANSWERED,
            ja_to_en: {
              attempts: 2,
              correct: 1,
              lastCorrect: true,
              lastAnsweredAt: '2026-09-05T00:00:00.000Z',
            },
          },
        },
      ],
      status: 'ready',
    });
    goTo('?day=31&scope=weak');
    render(<VocabView />);

    expect(await screen.findByText(/Day 31・苦手・手入力・ランダム・1問/)).toBeInTheDocument();
  });

  it('says what each 出題順 does, so No.順 is not chosen blind', async () => {
    // The two names describe the ORDER and say nothing about what it costs. A
    // reader who leaves 「No.順」 on and studies the same Day nightly learns the
    // sequence, and finds out only when the phrase turns up somewhere else.
    // Nothing else on the screen would ever tell them.
    const user = userEvent.setup();
    render(<VocabView />);

    expect(await screen.findByText(/毎回ちがう順番で出します/)).toBeInTheDocument();

    const orders = screen.getByRole('tablist', { name: '出題順' });
    await user.click(within(orders).getByRole('tab', { name: 'No.順' }));

    expect(await screen.findByText(/本の No\. 順に出します/)).toBeInTheDocument();
    // And the ランダム line is gone -- the two are one element, not two stacked
    // ones, so a reader is never told both things at once.
    expect(screen.queryByText(/毎回ちがう順番で出します/)).not.toBeInTheDocument();
  });

  it('says what each 出題範囲 selects, in words the reader can tell apart', async () => {
    // 「間違えた問題だけ」 and 「苦手」 are the pair somebody is most likely to
    // assume are the same thing, and the line under the tabs is the ONLY thing
    // distinguishing them. Nothing guarded it: the element could be deleted, or
    // the two sentences swapped, and every test still passed.
    const user = userEvent.setup();
    useVocabStore.setState({
      progress: [
        {
          wordId: 'et-481',
          byDirection: {
            en_to_ja: NEVER_ANSWERED,
            ja_to_en: {
              attempts: 3,
              correct: 1,
              lastCorrect: false,
              lastAnsweredAt: '2026-09-05T00:00:00.000Z',
            },
          },
        },
      ],
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    expect(await screen.findByText(/この Day の全問題です/)).toBeInTheDocument();

    const scopes = screen.getByRole('tablist', { name: '出題範囲' });
    await user.click(within(scopes).getByRole('tab', { name: '間違えた問題だけ' }));
    expect(await screen.findByText(/復習して正解すると外れます/)).toBeInTheDocument();

    await user.click(within(scopes).getByRole('tab', { name: '苦手' }));
    // Explicitly NOT the same sentence: the two ranges differ by which answers
    // they look at, and that difference is the whole reason both exist.
    expect(await screen.findByText(/復習して正解しても消えず/)).toBeInTheDocument();
    expect(screen.queryByText(/復習して正解すると外れます/)).not.toBeInTheDocument();
  });

  it('says WHY a range selected nothing, rather than showing a bare 0問', async () => {
    // `?scope=` survives a change of Day, so 「苦手」 chosen on a studied Day
    // lands on an untouched one with one tap. The screen used to show 「0問」 and
    // a disabled start button with no reason anywhere on it.
    goTo('?day=31&scope=weak');
    render(<VocabView />);

    expect(
      await screen.findByText(/この Day にはまだ間違えた問題がありません/),
    ).toBeInTheDocument();
  });

  it('does not point at 「苦手」 on a Day that has never been missed', async () => {
    // The other half of the note: a Day answered perfectly has nothing for
    // 「苦手」 either, so sending the reader there would be a dead end. This
    // branch had no test at all -- the note could be pinned to either sentence
    // and everything passed.
    useVocabStore.setState({
      progress: wordsForDay(31).map((word) => ({
        wordId: word.id,
        byDirection: {
          en_to_ja: NEVER_ANSWERED,
          ja_to_en: {
            attempts: 2,
            correct: 2,
            lastCorrect: true,
            lastAnsweredAt: '2026-09-05T00:00:00.000Z',
          },
        },
      })),
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    expect(
      await screen.findByText(/次に間違えたときに選べるようになります/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/「苦手」を選んでください/)).not.toBeInTheDocument();
  });

  it('offers 「間違えた問題だけ」 once something has been failed, and asks only those', async () => {
    const user = userEvent.setup();
    useVocabStore.setState({
      progress: [at('et-481', false), at('et-482', true)],
      status: 'ready',
    });
    goTo('?day=31');
    render(<VocabView />);

    const scopes = await screen.findByRole('tablist', { name: '出題範囲' });
    await user.click(within(scopes).getByRole('tab', { name: '間違えた問題だけ' }));

    // One word was failed; the word answered correctly is NOT in the set, even
    // though 「間違えた問題だけ」 on a fresh account would otherwise quietly mean
    // 「全部」.
    expect(await screen.findByText(/Day 31・間違えた問題だけ・手入力・ランダム・1問/)).toBeInTheDocument();
  });
});

describe('クイズを解く', () => {
  /**
   * Starts a one-question quiz over Day 31.
   *
   * `input` decides how the question OPENS -- 'typed' is the product default, so
   * a test that wants the choice list has to say so, exactly as a reader does.
   */
  async function startSingleQuestion(
    user: ReturnType<typeof userEvent.setup>,
    input: 'typed' | 'choice' = 'choice',
  ) {
    const day31 = wordsForDay(31);
    // Only the first word was failed, so 'wrong' selects exactly one.
    useVocabStore.setState({
      progress: [at(day31[0].id, false)],
      status: 'ready',
    });
    goTo(`?day=31&scope=wrong&input=${input}`);
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));
    return day31[0];
  }

  /** The visible choice buttons, in order. */
  const choiceButtons = () =>
    screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));

  it('shows the Japanese and asks for the English', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    expect(await screen.findByText(word.ja)).toBeInTheDocument();
    expect(screen.getByText('日本語 → 英語')).toBeInTheDocument();
    expect(screen.getByText('1 / 1 問目・ここまで 0問正解')).toBeInTheDocument();
  });

  it('reveals the explanation and the example after an answer, not before', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    // Before answering, the reveal must not be on screen -- it contains the
    // meaning, which is the answer.
    expect(screen.queryByText('解説')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: word.en }));

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

    const choices = choiceButtons();
    const wrong = choices.find((button) => button.textContent?.includes(word.en) === false)!;
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

    await user.click(await screen.findByRole('button', { name: word.en }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(1);
    expect(api.recordVocabAttempts).toHaveBeenCalledWith([
      { wordId: word.id, direction: 'ja_to_en', correct: true } satisfies VocabAttemptInput,
    ]);
  });

  it('lets the keyboard reach 中断する after answering', async () => {
    // The window listener used to swallow Enter and Space wherever focus was, so
    // 中断する was unreachable for anyone not using a mouse: pressing Enter on it
    // advanced to the next question instead of leaving the quiz.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.en }));
    const abort = screen.getByRole('button', { name: '中断する' });
    abort.focus();
    await user.keyboard('{Enter}');

    // Back on the setup screen, and nothing was recorded.
    expect(await screen.findByRole('button', { name: 'クイズを始める' })).toBeInTheDocument();
    expect(api.recordVocabAttempts).not.toHaveBeenCalled();
  });

  it('advances once when Enter is pressed on the focused 次へ button', async () => {
    // A <button> turns Enter into a click, and a window-level handler that also
    // acts on Enter makes one keypress advance twice. On the last question that
    // submits the whole run to the server a SECOND time, doubling every attempt
    // in the study record -- with nothing on screen to show it.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.en }));
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

    await user.click(await screen.findByRole('button', { name: word.en }));
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Enter}');

    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('結果')).toBeInTheDocument();
  });

  it('picks a choice with the number keys', async () => {
    const user = userEvent.setup();
    const word = await startSingleQuestion(user);

    const slot = choiceButtons().findIndex((b) => b.textContent?.includes(word.en));
    await user.keyboard(String(slot + 1));

    expect(await screen.findByText('正解')).toBeInTheDocument();
  });

  it('says so when the run could not be recorded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockRejectedValue(new Error('offline'));
    const word = await startSingleQuestion(user);

    await user.click(await screen.findByRole('button', { name: word.en }));
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

    await user.click(choiceButtons().find((b) => b.textContent?.includes(word.en) === false)!);
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

    await user.click(choiceButtons().find((b) => b.textContent?.includes(word.en) === false)!);
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    expect(await screen.findByText('間違えた 1問')).toBeInTheDocument();
    expect(screen.getByText(wordById(word.id)!.jaFull)).toBeInTheDocument();
  });

  it('never offers a choice that would also be correct', async () => {
    // 541 be glad to do and 542 be happy to do share their Japanese. Asked
    // 「〜してうれしい」→英語 with both on screen, the reader has two right
    // answers and is marked wrong for picking one.
    const user = userEvent.setup();
    useVocabStore.setState({ progress: [at('et-541', false)], status: 'ready' });
    goTo('?day=34&scope=wrong&input=choice');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    const texts = choiceButtons().map((b) => b.textContent ?? '');
    expect(texts.some((t) => t.includes('be glad to do'))).toBe(true);
    expect(texts.some((t) => t.includes('be happy to do'))).toBe(false);
  });
});

describe('手入力で答える', () => {
  async function startTyping(user: ReturnType<typeof userEvent.setup>) {
    const day31 = wordsForDay(31);
    // Failed in ja_to_en specifically: the review set is per direction, so a
    // fixture that recorded the other direction would leave nothing to ask.
    useVocabStore.setState({ progress: [at(day31[0].id, false)], status: 'ready' });
    // ja_to_en: the answer is English, which is what typing is really for.
    goTo('?day=31&scope=wrong&input=typed');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));
    return day31[0];
  }

  it('opens with a text box and no choices', async () => {
    // The choices ARE the answer. Showing them beside the box would turn every
    // typed answer into a copying exercise.
    const user = userEvent.setup();
    await startTyping(user);

    expect(await screen.findByLabelText('答えを入力')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('marks a correct typed answer', async () => {
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startTyping(user);

    await user.type(await screen.findByLabelText('答えを入力'), word.en);
    await user.click(screen.getByRole('button', { name: '答え合わせ' }));

    expect(await screen.findByText('正解')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '結果を見る' }));
    expect(api.recordVocabAttempts).toHaveBeenCalledWith([
      { wordId: word.id, direction: 'ja_to_en', correct: true },
    ]);
  });

  it('ignores case and spacing, which are not what is being learned', async () => {
    const user = userEvent.setup();
    const word = await startTyping(user);

    await user.type(await screen.findByLabelText('答えを入力'), `  ${word.en.toUpperCase()}  `);
    await user.click(screen.getByRole('button', { name: '答え合わせ' }));

    expect(await screen.findByText('正解')).toBeInTheDocument();
  });

  it('echoes back what was typed alongside the correct form', async () => {
    // Without this a reader who mistyped cannot tell whether they had the phrase
    // wrong or only the spelling.
    const user = userEvent.setup();
    const word = await startTyping(user);

    await user.type(await screen.findByLabelText('答えを入力'), 'come form');
    await user.click(screen.getByRole('button', { name: '答え合わせ' }));

    expect(await screen.findByText('不正解')).toBeInTheDocument();
    expect(screen.getByText(/あなたの解答/)).toHaveTextContent('come form');
    expect(screen.getByText(/あなたの解答/)).toHaveTextContent(word.en);
  });

  it('refuses to submit an empty box', async () => {
    // Submitting nothing would record a wrong answer the reader never gave, and
    // put the word into 「間違えた問題だけ」 for it.
    const user = userEvent.setup();
    await startTyping(user);

    expect(await screen.findByRole('button', { name: '答え合わせ' })).toBeDisabled();
    await user.type(await screen.findByLabelText('答えを入力'), '   ');
    expect(screen.getByRole('button', { name: '答え合わせ' })).toBeDisabled();
  });

  it('falls back to the choices on request, without ending the question', async () => {
    const user = userEvent.setup();
    const word = await startTyping(user);

    await user.click(await screen.findByRole('button', { name: '選択肢で答える' }));

    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    expect(choices.length).toBeGreaterThan(1);
    // Still unanswered: switching mode is not an answer.
    expect(screen.queryByText('正解')).not.toBeInTheDocument();
    expect(screen.queryByText('不正解')).not.toBeInTheDocument();

    await user.click(choices.find((b) => b.textContent?.includes(word.en))!);
    expect(await screen.findByText('正解')).toBeInTheDocument();
  });

  it('returns to typing on the next question after a fallback', async () => {
    // Falling back on one hard question must not silently turn the rest of the
    // run into multiple choice.
    const user = userEvent.setup();
    const day31 = wordsForDay(31);
    useVocabStore.setState({
      progress: [at(day31[0].id, false), at(day31[1].id, false)],
      status: 'ready',
    });
    goTo('?day=31&scope=wrong&input=typed');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    await user.click(await screen.findByRole('button', { name: '選択肢で答える' }));
    const choices = screen.getAllByRole('listitem').map((li) => within(li).getByRole('button'));
    await user.click(choices[0]);
    await user.click(await screen.findByRole('button', { name: '次の問題へ' }));

    expect(await screen.findByLabelText('答えを入力')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('accepts a synonym that would equally answer the prompt', async () => {
    // 「〜してうれしい」 is printed for both be glad to do and be happy to do. The
    // choice list deliberately shows only one of them, so the reader has no way
    // to know which row the quiz picked -- typing the other must be correct.
    const user = userEvent.setup();
    useVocabStore.setState({ progress: [at('et-541', false)], status: 'ready' });
    goTo('?day=34&scope=wrong&input=typed');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    await user.type(await screen.findByLabelText('答えを入力'), 'be happy to do');
    await user.click(screen.getByRole('button', { name: '答え合わせ' }));

    expect(await screen.findByText('正解')).toBeInTheDocument();
  });

  it('starts in the choice list when the reader asked for that', async () => {
    const user = userEvent.setup();
    const day31 = wordsForDay(31);
    useVocabStore.setState({ progress: [at(day31[0].id, false)], status: 'ready' });
    goTo('?day=31&scope=wrong&input=choice');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));

    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(screen.queryByLabelText('答えを入力')).not.toBeInTheDocument();
  });
});

describe('「分からない」', () => {
  async function startOne(user: ReturnType<typeof userEvent.setup>, input: 'typed' | 'choice') {
    const day31 = wordsForDay(31);
    useVocabStore.setState({ progress: [at(day31[0].id, false)], status: 'ready' });
    goTo(`?day=31&scope=wrong&input=${input}`);
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));
    return day31[0];
  }

  it.each(['typed', 'choice'] as const)('is offered in %s mode', async (input) => {
    const user = userEvent.setup();
    await startOne(user, input);
    expect(await screen.findByRole('button', { name: '分からない' })).toBeInTheDocument();
  });

  it('reveals the answer and the explanation without guessing', async () => {
    const user = userEvent.setup();
    const word = await startOne(user, 'typed');

    await user.click(await screen.findByRole('button', { name: '分からない' }));

    // Its own wording: what happened was not a wrong answer, it was no answer.
    expect(await screen.findByText('答えられなかった')).toBeInTheDocument();
    expect(screen.getByText(word.note)).toBeInTheDocument();
    expect(screen.getByText(/正解:/)).toHaveTextContent(word.en);
  });

  it('records it as wrong, so the word comes back in 「間違えた問題だけ」', async () => {
    // The whole reason not to guess: a lucky click on four options marks a word
    // learned one time in four, and the review list is built on that record.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    const word = await startOne(user, 'choice');

    await user.click(await screen.findByRole('button', { name: '分からない' }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    expect(api.recordVocabAttempts).toHaveBeenCalledWith([
      { wordId: word.id, direction: 'ja_to_en', correct: false },
    ]);
  });
});

describe('未記録の解答', () => {
  it('survives leaving the results screen, and can be re-sent from the Day list', async () => {
    // It used to live only in the results component's state, so 「Day を選び直す」
    // -- the button directly under 「記録できませんでした」 -- destroyed the only
    // copy of the run.
    const user = userEvent.setup();
    vi.mocked(api.recordVocabAttempts).mockRejectedValue(new Error('offline'));
    const day31 = wordsForDay(31);
    useVocabStore.setState({ progress: [at(day31[0].id, false)], status: 'ready' });
    goTo('?day=31&scope=wrong&input=choice');
    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: 'クイズを始める' }));
    await user.click(await screen.findByRole('button', { name: '分からない' }));
    await user.click(await screen.findByRole('button', { name: '結果を見る' }));

    await user.click(await screen.findByRole('button', { name: 'Day を選び直す' }));

    expect(await screen.findByText(/記録できていない解答が 1問あります/)).toBeInTheDocument();

    vi.mocked(api.recordVocabAttempts).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'もう一度記録する' }));
    expect(api.recordVocabAttempts).toHaveBeenCalledTimes(2);
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

    // Asks first. One click, no undo, and what it destroys is the input to
    // 「間違えた問題だけ」.
    expect(api.resetVocabProgress).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: '消す' }));
    expect(api.resetVocabProgress).toHaveBeenCalledWith(31);
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetVocabProgress).mockResolvedValue([]);
    useVocabStore.setState({ progress: [at('et-481', true)], status: 'ready' });

    render(<VocabView />);
    await user.click(await screen.findByRole('button', { name: /Day 31 の記録を消す/ }));
    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    expect(api.resetVocabProgress).not.toHaveBeenCalled();
  });

  it('shows the failure instead of an empty record when the load fails', async () => {
    useVocabStore.setState({ progress: [], status: 'error' });
    render(<VocabView />);
    expect(await screen.findByText(/学習記録を読み込めませんでした/)).toBeInTheDocument();
  });
});
