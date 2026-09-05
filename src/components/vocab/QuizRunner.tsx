import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { VocabAttemptInput } from '../../types';
import {
  canonicalAnswer,
  isAcceptedAnswer,
  wordById,
  type QuizInputMode,
  type QuizQuestion,
} from '../../../shared/vocabulary';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';

interface Props {
  questions: readonly QuizQuestion[];
  /**
   * How each question opens: typing, or the choice list.
   *
   * Per QUESTION, not per session -- whichever way a question starts, the reader
   * can always fall back to the choices for that one without changing the
   * setting for the rest.
   */
  defaultInputMode: QuizInputMode;
  /** Called once, with the whole run, when the last question is answered. */
  onFinish: (attempts: VocabAttemptInput[]) => void;
  onAbort: () => void;
}

// ---------------------------------------------------------------------------
// TYPING FIRST, WITH THE CHOICES ONE CLICK AWAY.
//
// Recognising 「〜に由来する」 among four options and producing `come from` from
// nothing are different skills, and only the second is what you need in order to
// use the phrase. So a question opens as an empty box.
//
// It does NOT open as an empty box you are stuck in. 「選択肢で答える」 turns the
// question into the four-option form at any point before answering, because the
// alternative -- a reader who cannot retrieve the phrase, staring at a blank
// field -- teaches nothing at all. Falling back is a normal move, not a
// failure, so nothing about it is discouraged or recorded.
//
// WHY THE FALLBACK IS NOT RECORDED
//   It is tempting to mark a choice-answered question as "easier" in the study
//   record. That would mean the stored history depends on how the reader felt
//   about a question rather than on whether they knew it, and 「間違えた問題だけ」
//   -- the list built on that history -- would quietly change meaning. What is
//   recorded is what has always been recorded: right or wrong.
//
// AN ANSWER IS NEVER TAKEN BACK.
//   Once given, the choice is locked and the explanation appears. An answer that
//   can be changed after the correct one is shown records what the reader could
//   SEE, not what they knew.
// ---------------------------------------------------------------------------

/** The number keys, so a desktop reader never has to reach for the mouse. */
const CHOICE_KEYS = ['1', '2', '3', '4', '5', '6'] as const;

/** What the reader gave, and how. `correct` is decided once, at the moment of answering. */
type Given =
  | { via: 'choice'; wordId: string; correct: boolean }
  | { via: 'typed'; text: string; correct: boolean };

export function QuizRunner({
  questions,
  defaultInputMode,
  onFinish,
  onAbort,
}: Props): ReactElement {
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<Given | null>(null);
  const [attempts, setAttempts] = useState<VocabAttemptInput[]>([]);
  const [mode, setMode] = useState<QuizInputMode>(defaultInputMode);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const question = questions[index];
  const word = wordById(question.wordId);
  const isLast = index === questions.length - 1;

  // Focus the box on every new question, so a reader working through a Day never
  // has to click before typing.
  useEffect(() => {
    if (given === null && mode === 'typed') inputRef.current?.focus();
  }, [given, index, mode]);

  const answerWithChoice = useCallback(
    (choiceWordId: string) => {
      setGiven(
        (current) =>
          current ?? {
            via: 'choice',
            wordId: choiceWordId,
            correct: choiceWordId === question.answerWordId,
          },
      );
    },
    [question.answerWordId],
  );

  const answerWithText = useCallback(() => {
    if (word === undefined) return;
    const text = typed.trim();
    // An empty box is not an answer. Submitting it would record a wrong answer
    // the reader never gave, and put the word into 「間違えた問題だけ」 for it.
    if (text.length === 0) return;
    setGiven((current) => current ?? {
      via: 'typed',
      text,
      correct: isAcceptedAnswer(text, word, question.direction),
    });
  }, [question.direction, typed, word]);

  const advance = useCallback(() => {
    if (given === null) return;

    const next: VocabAttemptInput[] = [
      ...attempts,
      {
        wordId: question.wordId,
        // THIS question's direction, not the session setting: a mixed session
        // that recorded the setting would make every answer count towards one
        // direction and the breakdown would be fiction.
        direction: question.direction,
        correct: given.correct,
      },
    ];

    if (isLast) {
      onFinish(next);
      return;
    }
    setAttempts(next);
    setGiven(null);
    setTyped('');
    // Back to whatever the reader chose for the session. Falling back to the
    // choices on one hard question must not silently turn the rest of the run
    // into multiple choice.
    setMode(defaultInputMode);
    setIndex((i) => i + 1);
  }, [attempts, defaultInputMode, given, isLast, onFinish, question]);

  // Keyboard. Bound while this screen is mounted only, and it stands aside for a
  // modified press so the browser's own shortcuts still work.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      if (given === null) {
        // While typing, the only key this owns is Enter -- the digits belong to
        // the text box.
        if (mode === 'typed') return;
        const slot = CHOICE_KEYS.indexOf(event.key as (typeof CHOICE_KEYS)[number]);
        if (slot >= 0 && slot < question.choices.length) {
          event.preventDefault();
          answerWithChoice(question.choices[slot].wordId);
        }
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        // preventDefault() before advance(), not after.
        //
        // Space scrolls the page, and Enter or Space on a focused button is also
        // a click -- so when 次へ has focus this listener and that click are the
        // same keypress. Cancelling the default action is what keeps them from
        // both running.
        event.preventDefault();
        advance();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, answerWithChoice, given, mode, question.choices]);

  const correctSoFar = useMemo(() => attempts.filter((a) => a.correct).length, [attempts]);
  const answeredCorrectly = given?.correct === true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--color-content-muted)]">
            {index + 1} / {questions.length} 問目・ここまで {correctSoFar}問正解
          </p>
          {/* A live region so a screen-reader user hears the position change
              without having to go looking for it. */}
          <p className="sr-only" role="status">
            {index + 1}問目、全{questions.length}問
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onAbort}>
          中断する
        </Button>
      </div>

      <div
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
        aria-hidden
      >
        <div
          className="h-full bg-[var(--color-accent-primary)] transition-[width] duration-300"
          style={{ width: `${((index + (given ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <Card padding="lg">
        <p className="text-xs text-[var(--color-content-muted)]">
          {question.direction === 'en_to_ja' ? '英語 → 日本語' : '日本語 → 英語'}
        </p>
        <p
          className={cn(
            'mt-2 font-semibold text-[var(--color-content-primary)]',
            // The English is set larger: it is the string being learned, and on a
            // phone the Japanese wraps at this size while the English does not.
            question.direction === 'en_to_ja' ? 'text-3xl' : 'text-2xl',
          )}
        >
          {question.prompt}
        </p>
      </Card>

      {/* --- Answering by typing --------------------------------------------- */}
      {given === null && mode === 'typed' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            answerWithText();
          }}
          className="space-y-2"
        >
          <label htmlFor="vocab-answer" className="sr-only">
            答えを入力
          </label>
          <input
            id="vocab-answer"
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            // Off on all four: a study field that autocompletes the answer, or
            // capitalises and "corrects" it, is grading the phone rather than
            // the reader.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={question.direction === 'en_to_ja' ? '意味を入力' : '英語を入力'}
            className={cn(
              'w-full rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]',
              'bg-[var(--color-surface-raised)] px-4 py-3 text-base',
              'text-[var(--color-content-primary)] placeholder:text-[var(--color-content-muted)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
            )}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={typed.trim().length === 0}>
              答え合わせ
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('choice')}>
              選択肢で答える
            </Button>
          </div>
          <p className="text-[11px] text-[var(--color-content-muted)]">
            〜・記号・前後の空白は無視されます。書籍の別の意味や同義語でも正解になります。
          </p>
        </form>
      )}

      {/* --- Answering by choosing, and the revealed list --------------------- */}
      {(mode === 'choice' || given !== null) && (
        <ul className="space-y-2">
          {question.choices.map((choice, slot) => {
            const isAnswer = choice.wordId === question.answerWordId;
            const isPicked = given?.via === 'choice' && given.wordId === choice.wordId;
            const revealed = given !== null;

            return (
              <li key={choice.wordId}>
                <button
                  type="button"
                  disabled={revealed}
                  onClick={() => answerWithChoice(choice.wordId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                    // Once revealed, the CORRECT option is marked whether or not
                    // it was the one chosen -- and whether or not the reader used
                    // the list at all. Someone who typed a wrong answer still has
                    // to be able to see the right one here.
                    revealed && isAnswer && 'border-[var(--color-semantic-success)] bg-[var(--color-semantic-success)]/10',
                    revealed && isPicked && !isAnswer && 'border-[var(--color-semantic-danger)] bg-[var(--color-semantic-danger)]/10',
                    revealed && !isAnswer && !isPicked && 'border-[var(--color-border-subtle)] opacity-60',
                    !revealed && 'border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)]',
                  )}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-content-muted)]"
                    aria-hidden
                  >
                    {CHOICE_KEYS[slot] ?? slot + 1}
                  </span>
                  <span className="text-sm text-[var(--color-content-primary)]">{choice.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {given !== null && word && (
        <Card padding="lg" className="space-y-3">
          <p
            className={cn(
              'text-sm font-semibold',
              answeredCorrectly
                ? 'text-[var(--color-semantic-success)]'
                : 'text-[var(--color-semantic-danger)]',
            )}
            role="status"
          >
            {answeredCorrectly ? '正解' : '不正解'}
          </p>

          {/* What they wrote, echoed back. Without it a reader who mistyped
              cannot tell whether they had the phrase wrong or the spelling. */}
          {given.via === 'typed' && (
            <p className="text-xs text-[var(--color-content-muted)]">
              あなたの解答: <span className="text-[var(--color-content-secondary)]">{given.text}</span>
              {!answeredCorrectly && (
                <>
                  {' '}／ 正解:{' '}
                  <span className="text-[var(--color-content-secondary)]">
                    {canonicalAnswer(word, question.direction)}
                  </span>
                </>
              )}
            </p>
          )}

          <div>
            <p className="text-lg font-semibold text-[var(--color-content-primary)]">{word.en}</p>
            <p className="text-sm text-[var(--color-content-secondary)]">{word.jaFull}</p>
          </div>

          {/* The synonym note only appears where it matters: the book prints
              three pairs with the same Japanese, and the quiz deliberately never
              shows both. Without this, a reader who knows the other one is left
              thinking their answer was wrong. */}
          {word.synonymIds && word.synonymIds.length > 0 && (
            <p className="text-xs text-[var(--color-content-muted)]">
              同義:{' '}
              {word.synonymIds
                .map((id) => wordById(id)?.en)
                .filter((en): en is string => en !== undefined)
                .join('、')}
            </p>
          )}

          <div className="space-y-2 border-t border-[var(--color-border-subtle)] pt-3">
            <div>
              <p className="text-[11px] font-medium text-[var(--color-content-muted)]">解説</p>
              <p className="text-sm text-[var(--color-content-secondary)]">{word.note}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--color-content-muted)]">
                ワンポイント・アドバイス
              </p>
              <p className="text-sm text-[var(--color-content-secondary)]">{word.tip}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--color-content-muted)]">例文</p>
              {/* `surface-base` and a border, NOT `surface-overlay`: in the light
                  theme the overlay token is white and this block sits inside a
                  white Card, so the example was indistinguishable from the
                  paragraph above it. `surface-base` is the page ground, which is
                  a step away from the card in BOTH themes. */}
              <div className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] p-3">
                <p className="text-sm text-[var(--color-content-primary)]">{word.example.en}</p>
                <p className="mt-1 text-xs text-[var(--color-content-muted)]">{word.example.ja}</p>
              </div>
            </div>
          </div>

          <Button onClick={advance} className="w-full">
            {isLast ? '結果を見る' : '次の問題へ'}
          </Button>
        </Card>
      )}
    </div>
  );
}
