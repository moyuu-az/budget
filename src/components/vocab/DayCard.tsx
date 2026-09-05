import type { ReactElement } from 'react';
// From shared/vocabulary rather than from src/types: `VocabDay` and
// `VocabSummary` describe the CONTENT and the figures derived from it, neither
// of which crosses the wire. Only the study record does, and that lives in
// shared/types.ts with the rest of the contract.
import type { VocabDay, VocabSummary } from '../../../shared/vocabulary';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/cn';

interface Props {
  day: VocabDay;
  summary: VocabSummary;
  selected: boolean;
  onSelect: (dayId: number) => void;
}

/** 0.826 -> 「83%」. Rounded, because a study screen is not an accountancy one. */
const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

/**
 * One Day in the picker, carrying the two figures that decide whether to open
 * it: how much of it has been answered, and how much of it is still wrong.
 *
 * THE BADGE IS 定着率, NOT 通算正答率. Both are in the summary; only one of them
 * can be read alongside 「要復習 N問」 without contradicting it. 定着率 counts the
 * words whose MOST RECENT answer was right, which is the same basis the review
 * set uses, so 100% and 「要復習 0問」 are the same statement. The lifetime ratio
 * cannot return to 100% once a word has ever been missed, so a fully-revised Day
 * would have shown 「正答率 81%」 next to nothing left to revise. See the note on
 * `accuracy` in shared/vocabulary/stats.ts.
 *
 * IT IS ABSENT UNTIL SOMETHING HAS BEEN ANSWERED, rather than shown as 0%. The
 * two look identical as a number and mean opposite things, and 0% on a Day
 * nobody has opened would tell the reader they had failed sixteen questions they
 * have never seen.
 */
export function DayCard({ day, summary, selected, onSelect }: Props): ReactElement {
  const tone = summary.wrong > 0 ? 'warning' : summary.answered > 0 ? 'success' : 'neutral';

  return (
    <button
      type="button"
      onClick={() => onSelect(day.id)}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-[var(--radius-lg)] border p-4 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
        selected
          ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)]',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-content-primary)]">
          Day {day.id}
        </span>
        <Badge tone={tone}>
          {summary.retention === null ? '未挑戦' : `定着 ${percent(summary.retention)}`}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-[var(--color-content-secondary)]">{day.title}</p>
      <p className="text-[11px] leading-snug text-[var(--color-content-muted)]">{day.subtitle}</p>

      <p className="mt-3 text-[11px] text-[var(--color-content-muted)]">
        {summary.total}問中 {summary.answered}問に解答
        {summary.wrong > 0 && (
          <span className="ml-1 text-[var(--color-semantic-warning)]">
            ・要復習 {summary.wrong}問
          </span>
        )}
      </p>
    </button>
  );
}
