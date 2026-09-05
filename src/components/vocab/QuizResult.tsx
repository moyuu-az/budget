import type { ReactElement } from 'react';
import type { VocabAttemptInput } from '../../types';
import { wordById, type QuizQuestion } from '../../../shared/vocabulary';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface Props {
  questions: readonly QuizQuestion[];
  attempts: readonly VocabAttemptInput[];
  /** True while the run is being written; false once it is stored or has failed. */
  saving: boolean;
  /** Whether the run reached the server. False means the record was NOT updated. */
  saved: boolean;
  onRetrySave: () => void;
  /** Offered only when something was missed. */
  onReviewWrong: (() => void) | null;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// THE RESULT SCREEN HAS TO BE HONEST ABOUT TWO DIFFERENT THINGS.
//
//   1. How the run went. Straightforward.
//   2. WHETHER IT WAS RECORDED.
//
// The second is the one worth writing down. If the submission failed and this
// screen simply showed the score, the reader would move on believing their
// review list had been updated -- and 「間違えた問題だけ」 would then quietly omit
// exactly the words they had just got wrong. So a failure is stated on the
// screen, with a retry, rather than left to a toast that has already faded.
// ---------------------------------------------------------------------------

export function QuizResult({
  questions,
  attempts,
  saving,
  saved,
  onRetrySave,
  onReviewWrong,
  onBack,
}: Props): ReactElement {
  const correct = attempts.filter((a) => a.correct).length;
  const missed = attempts
    .map((attempt, i) => ({ attempt, question: questions[i] }))
    .filter(({ attempt }) => !attempt.correct);

  return (
    <div className="space-y-4">
      <Card padding="lg" className="text-center">
        <p className="text-xs text-[var(--color-content-muted)]">結果</p>
        <p className="mt-1 text-4xl font-semibold text-[var(--color-content-primary)]">
          {correct}
          <span className="text-xl text-[var(--color-content-muted)]"> / {attempts.length}</span>
        </p>
        <p className="mt-1 text-sm text-[var(--color-content-secondary)]">
          正答率 {Math.round((correct / Math.max(1, attempts.length)) * 100)}%
        </p>
      </Card>

      {saving && (
        <p className="text-center text-xs text-[var(--color-content-muted)]" role="status">
          記録しています…
        </p>
      )}

      {!saving && !saved && (
        <Card padding="md" className="space-y-2 border-[var(--color-semantic-danger)]/40">
          <p className="text-sm font-medium text-[var(--color-semantic-danger)]">
            この結果は記録できませんでした
          </p>
          <p className="text-xs text-[var(--color-content-secondary)]">
            通信に失敗した可能性があります。記録されていないため、「間違えた問題だけ」には
            反映されていません。この画面を離れても解答は保持され、Day の一覧から再送できます。
          </p>
          <Button size="sm" variant="secondary" onClick={onRetrySave}>
            もう一度記録する
          </Button>
        </Card>
      )}

      {missed.length > 0 && (
        <Card padding="md">
          <p className="text-sm font-medium text-[var(--color-content-primary)]">
            間違えた {missed.length}問
          </p>
          <ul className="mt-3 space-y-3">
            {missed.map(({ question }) => {
              const word = wordById(question.wordId);
              if (!word) return null;
              return (
                <li
                  key={`${question.wordId}-${question.direction}`}
                  className="border-t border-[var(--color-border-subtle)] pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-sm font-medium text-[var(--color-content-primary)]">
                    {word.en}
                  </p>
                  <p className="text-xs text-[var(--color-content-secondary)]">{word.jaFull}</p>
                  <p className="mt-1 text-xs text-[var(--color-content-muted)]">{word.tip}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Offered ONLY when the run was recorded. Rebuilding the review set from
            a record the server never received would ask a set the stored
            progress does not agree with, and the reader would be told they had
            fixed words that are still marked wrong. */}
        {onReviewWrong && saved && (
          <Button onClick={onReviewWrong} className="flex-1">
            間違えた問題をもう一度
          </Button>
        )}
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Day を選び直す
        </Button>
      </div>
    </div>
  );
}
