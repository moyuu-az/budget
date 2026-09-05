import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { VocabAttemptInput } from '../../types';
import {
  QUIZ_DIRECTION_SETTINGS,
  QUIZ_INPUT_MODES,
  QUIZ_SCOPES,
  VOCAB_DAYS,
  VOCAB_WORDS,
  buildQuiz,
  isVocabDayId,
  selectWords,
  summarize,
  wordsForDay,
  type QuizDirectionSetting,
  type QuizInputMode,
  type QuizQuestion,
  type QuizScope,
} from '../../../shared/vocabulary';
import { SEARCH_PARAMS, parseEnumParam, parseIntParam } from '../../app/routes';
import { reportError } from '../../app/reportError';
import { useSearchParam } from '../../hooks/useRoute';
import { useVocabStore } from '../../stores/useVocabStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { LoadGate } from '../ui/LoadGate';
import { Tabs } from '../ui/Tabs';
import { DayCard } from './DayCard';
import { QuizResult } from './QuizResult';
import { QuizRunner } from './QuizRunner';

// ---------------------------------------------------------------------------
// 英単語 -- the one screen in this app that is not about money.
//
// WHAT IS IN THE URL AND WHAT IS NOT
//   The three SETTINGS (Day, direction, scope) live in the query, because they
//   answer "what is on screen" and survive the reload a phone performs on its
//   own whenever the browser reclaims the tab.
//
//   The RUN does not. "You are on question 4 of 12 and have 3 right" is the
//   middle of an action, not a filter: putting it in the address would let the
//   back button rewind a quiz into a state whose answers had already been
//   counted, and a shared link would drop somebody into somebody else's session.
//   Losing a half-finished quiz to a reload is the acceptable half of that
//   trade; corrupting the study record is not.
//
// WHY THE PROGRESS IS FETCHED HERE AND NOT IN loadLedgerData
//   It is not ledger data. See src/stores/useVocabStore.ts -- the record belongs
//   to the person, so a ledger switch must not clear it, and the dashboard has
//   no business waiting on a quiz record to draw a balance.
// ---------------------------------------------------------------------------

const DIRECTION_LABEL: Record<QuizDirectionSetting, string> = {
  both: '両方',
  en_to_ja: '英語 → 日本語',
  ja_to_en: '日本語 → 英語',
};

const SCOPE_LABEL: Record<QuizScope, string> = {
  all: 'すべて',
  wrong: '間違えた問題だけ',
};

/**
 * How a question OPENS. The reader can always fall back to the choices on any
 * single question without changing this.
 *
 * 手入力 is the default because it is the mode that actually tests whether the
 * phrase can be produced rather than recognised -- and because the fallback is
 * one click away, defaulting to the harder mode costs nothing.
 */
const INPUT_MODE_LABEL: Record<QuizInputMode, string> = {
  typed: '手入力',
  choice: '選択肢',
};

interface Run {
  questions: QuizQuestion[];
  /** Set once the run is finished; null while it is still being answered. */
  attempts: VocabAttemptInput[] | null;
  /** Whether the finished run reached the server. Meaningless while answering. */
  saved: boolean;
}

function VocabView(): ReactElement {
  const progress = useVocabStore((s) => s.progress);
  const status = useVocabStore((s) => s.status);
  const saving = useVocabStore((s) => s.saving);
  const fetchProgress = useVocabStore((s) => s.fetchProgress);
  const recordAttempts = useVocabStore((s) => s.recordAttempts);
  const resetProgress = useVocabStore((s) => s.resetProgress);

  // Fetched on first open rather than at start-up. `status === 'idle'` is the
  // "never asked" state, so this does not re-run after a failure -- LoadGate's
  // retry button is what asks again, which keeps a broken connection from
  // becoming a request loop.
  useEffect(() => {
    if (status === 'idle') void fetchProgress().catch(reportError);
  }, [status, fetchProgress]);

  const [dayId, setDayId] = useSearchParam<number>({
    name: SEARCH_PARAMS.vocab.day,
    parse: parseIntParam(isVocabDayId),
    fallback: VOCAB_DAYS[0].id,
    serialize: String,
  });
  const [direction, setDirection] = useSearchParam<QuizDirectionSetting>({
    name: SEARCH_PARAMS.vocab.dir,
    parse: parseEnumParam(QUIZ_DIRECTION_SETTINGS),
    fallback: 'both',
    serialize: (value) => value,
  });
  const [scope, setScope] = useSearchParam<QuizScope>({
    name: SEARCH_PARAMS.vocab.scope,
    parse: parseEnumParam(QUIZ_SCOPES),
    fallback: 'all',
    serialize: (value) => value,
  });

  const [inputMode, setInputMode] = useSearchParam<QuizInputMode>({
    name: SEARCH_PARAMS.vocab.input,
    parse: parseEnumParam(QUIZ_INPUT_MODES),
    fallback: 'typed',
    serialize: (value) => value,
  });

  const [run, setRun] = useState<Run | null>(null);

  const dayWords = useMemo(() => wordsForDay(dayId), [dayId]);
  const selected = useMemo(
    () => selectWords(dayWords, progress, scope, direction),
    [dayWords, progress, scope, direction],
  );
  const daySummary = useMemo(
    () => summarize(dayWords, progress, direction),
    [dayWords, progress, direction],
  );
  const overall = useMemo(() => summarize(VOCAB_WORDS, progress, 'both'), [progress]);

  const start = useCallback(
    (words: readonly (typeof VOCAB_WORDS)[number][]) => {
      setRun({
        questions: buildQuiz({
          words,
          // Distractors come from the WHOLE Day, not from the words being asked.
          // A 'wrong only' run of three words would otherwise offer three
          // choices drawn from the three answers, and the reader could solve it
          // by elimination without knowing any of them.
          distractorPool: wordsForDay(dayId),
          direction,
          seed: Date.now(),
        }),
        attempts: null,
        saved: false,
      });
    },
    [dayId, direction],
  );

  const finish = useCallback(
    async (attempts: VocabAttemptInput[]) => {
      // Shown immediately, saved in the background: the score is already known
      // from what the reader answered, and making them watch a spinner to see it
      // would be theatre. Whether it was RECORDED is reported separately, which
      // is the part they cannot work out for themselves.
      setRun((current) => (current ? { ...current, attempts } : current));
      const saved = await recordAttempts(attempts);
      setRun((current) => (current ? { ...current, saved } : current));
    },
    [recordAttempts],
  );

  const retrySave = useCallback(() => {
    if (!run?.attempts) return;
    void finish(run.attempts);
  }, [finish, run]);

  // --- Running a quiz -------------------------------------------------------
  if (run && run.attempts === null) {
    return (
      <QuizRunner
        questions={run.questions}
        defaultInputMode={inputMode}
        onFinish={(attempts) => void finish(attempts)}
        onAbort={() => setRun(null)}
      />
    );
  }

  if (run && run.attempts !== null) {
    const missed = run.questions.filter((_, i) => !run.attempts![i].correct);
    return (
      <QuizResult
        questions={run.questions}
        attempts={run.attempts}
        saving={saving}
        saved={run.saved}
        onRetrySave={retrySave}
        onReviewWrong={
          missed.length === 0
            ? null
            : () => {
                // Re-asks exactly the words just missed, rather than re-reading
                // the scope: the stored progress has only just been updated, and
                // deriving the set from `selected` here would race that update.
                const words = missed
                  .map((q) => VOCAB_WORDS.find((w) => w.id === q.wordId))
                  .filter((w): w is (typeof VOCAB_WORDS)[number] => w !== undefined);
                start(words);
              }
        }
        onBack={() => setRun(null)}
      />
    );
  }

  // --- Choosing what to study ----------------------------------------------
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-[var(--color-content-primary)]">英単語</h1>
        <p className="text-xs text-[var(--color-content-secondary)]">
          英熟語ターゲット Day 31〜35（No.481〜560）
        </p>
      </header>

      <LoadGate status={status} height={360} label="学習記録" onRetry={fetchProgress}>
        <Card padding="md" className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] text-[var(--color-content-muted)]">全体の正答率</p>
            <p className="text-2xl font-semibold text-[var(--color-content-primary)]">
              {overall.accuracy === null
                ? '—'
                : `${Math.round(overall.accuracy * 100)}%`}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-content-muted)]">解答した単語</p>
            <p className="text-sm text-[var(--color-content-secondary)]">
              {overall.answered} / {overall.total}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-content-muted)]">要復習</p>
            <p className="text-sm text-[var(--color-content-secondary)]">{overall.wrong}語</p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--color-content-muted)]">総解答数</p>
            <p className="text-sm text-[var(--color-content-secondary)]">{overall.attempts}回</p>
          </div>
        </Card>

        <section aria-label="Day を選ぶ" className="mt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VOCAB_DAYS.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                summary={summarize(wordsForDay(day.id), progress, direction)}
                selected={day.id === dayId}
                onSelect={setDayId}
              />
            ))}
          </div>
        </section>

        <Card padding="md" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-content-muted)]">出題の向き</p>
              <Tabs
                ariaLabel="出題の向き"
                size="sm"
                value={direction}
                onChange={setDirection}
                items={QUIZ_DIRECTION_SETTINGS.map((value) => ({
                  value,
                  label: DIRECTION_LABEL[value],
                }))}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-content-muted)]">解答方法</p>
              <Tabs
                ariaLabel="解答方法"
                size="sm"
                value={inputMode}
                onChange={setInputMode}
                items={QUIZ_INPUT_MODES.map((value) => ({
                  value,
                  label: INPUT_MODE_LABEL[value],
                }))}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-content-muted)]">出題範囲</p>
              <Tabs
                ariaLabel="出題範囲"
                size="sm"
                value={scope}
                onChange={setScope}
                items={QUIZ_SCOPES.map((value) => ({
                  value,
                  label: SCOPE_LABEL[value],
                  // Disabled rather than hidden, and only when there is genuinely
                  // nothing wrong: a control that vanishes leaves the reader
                  // wondering where it went, and one that starts an empty quiz
                  // is worse.
                  disabled: value === 'wrong' && daySummary.wrong === 0,
                }))}
              />
            </div>
          </div>

          <p className="text-xs text-[var(--color-content-secondary)]">
            Day {dayId}・{SCOPE_LABEL[scope]}・{INPUT_MODE_LABEL[inputMode]}・{selected.length}問
            {scope === 'wrong' && daySummary.wrong === 0 && (
              <span className="ml-1 text-[var(--color-semantic-success)]">
                （間違えた問題はありません）
              </span>
            )}
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              disabled={selected.length === 0}
              onClick={() => start(selected)}
            >
              クイズを始める
            </Button>
            <Button
              variant="ghost"
              disabled={daySummary.answered === 0}
              onClick={() => {
                void resetProgress(dayId);
              }}
            >
              Day {dayId} の記録を消す
            </Button>
          </div>
        </Card>
      </LoadGate>
    </div>
  );
}

export default VocabView;
