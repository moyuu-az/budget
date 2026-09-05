import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { VocabAttemptInput } from '../../types';
import { wordById, type QuizQuestion } from '../../../shared/vocabulary';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';

interface Props {
  questions: readonly QuizQuestion[];
  /** Called once, with the whole run, when the last question is answered. */
  onFinish: (attempts: VocabAttemptInput[]) => void;
  onAbort: () => void;
}

// ---------------------------------------------------------------------------
// ONE QUESTION AT A TIME, AND THE ANSWER IS NEVER TAKEN BACK.
//
// Choosing reveals the outcome and the explanation, and the choice is then
// locked. That is the whole design decision in this component:
//
//   An answer that can be changed after the correct one is shown records what
//   the reader could SEE, not what they KNEW -- and 「間違えた問題だけ」 is built
//   entirely on that record. A quiz you can undo produces a review list that
//   quietly empties itself.
//
// THE RUN IS SUBMITTED ONCE, AT THE END. Per-answer requests would make the
// record depend on the connection holding for all sixteen; a walk into a lift
// would lose the middle of a session, and the reader would never be told which
// part.
// ---------------------------------------------------------------------------

/** The number keys, so a desktop reader never has to reach for the mouse. */
const CHOICE_KEYS = ['1', '2', '3', '4', '5', '6'] as const;

export function QuizRunner({ questions, onFinish, onAbort }: Props): ReactElement {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<VocabAttemptInput[]>([]);

  const question = questions[index];
  const word = wordById(question.wordId);
  const isLast = index === questions.length - 1;

  const choose = useCallback(
    (choiceWordId: string) => {
      // Locked after the first choice; see the header.
      setPicked((current) => current ?? choiceWordId);
    },
    [],
  );

  const advance = useCallback(() => {
    if (picked === null) return;

    const next: VocabAttemptInput[] = [
      ...attempts,
      {
        wordId: question.wordId,
        // THIS question's direction, not the session setting: a mixed session
        // that recorded the setting would make every answer count towards one
        // direction and the breakdown would be fiction.
        direction: question.direction,
        correct: picked === question.answerWordId,
      },
    ];

    if (isLast) {
      onFinish(next);
      return;
    }
    setAttempts(next);
    setPicked(null);
    setIndex((i) => i + 1);
  }, [attempts, isLast, onFinish, picked, question]);

  // Number keys pick, Enter/Space moves on. Bound while this screen is mounted
  // only, and it stands aside for a modified press so the browser's own
  // shortcuts still work.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      if (picked === null) {
        const slot = CHOICE_KEYS.indexOf(event.key as (typeof CHOICE_KEYS)[number]);
        if (slot >= 0 && slot < question.choices.length) {
          event.preventDefault();
          choose(question.choices[slot].wordId);
        }
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        advance();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, choose, picked, question.choices]);

  const correctSoFar = useMemo(() => attempts.filter((a) => a.correct).length, [attempts]);
  const answeredCorrectly = picked === question.answerWordId;

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
          style={{ width: `${((index + (picked ? 1 : 0)) / questions.length) * 100}%` }}
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

      <ul className="space-y-2">
        {question.choices.map((choice, slot) => {
          const isAnswer = choice.wordId === question.answerWordId;
          const isPicked = choice.wordId === picked;
          const revealed = picked !== null;

          return (
            <li key={choice.wordId}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => choose(choice.wordId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                  // Once revealed, the CORRECT option is marked whether or not it
                  // was the one chosen. A reader who guessed wrong has to be able
                  // to see the right answer without hunting for it.
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

      {picked !== null && word && (
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
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-overlay)] p-3">
              <p className="text-sm text-[var(--color-content-primary)]">{word.example.en}</p>
              <p className="mt-1 text-xs text-[var(--color-content-muted)]">{word.example.ja}</p>
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
