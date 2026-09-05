import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import type { VocabAttemptInput } from '../../types';
import {
  QUIZ_INPUT_MODES,
  QUIZ_ORDERS,
  QUIZ_SCOPES,
  VOCAB_DAYS,
  WEAK_QUIZ_LIMIT,
  VOCAB_WORDS,
  buildQuiz,
  isVocabDayId,
  selectWords,
  summarize,
  wordsForDay,
  type QuizDirectionSetting,
  type QuizInputMode,
  type QuizOrder,
  type QuizQuestion,
  type QuizScope,
} from '../../../shared/vocabulary';
import { SEARCH_PARAMS, parseEnumParam, parseIntParam } from '../../app/routes';
import { reportError } from '../../app/reportError';
import { useSearchParam } from '../../hooks/useRoute';
import { useVocabStore } from '../../stores/useVocabStore';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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
//   The SETTINGS (Day, scope, input mode, order) live in the query, because
//   they answer "what is on screen" and survive the reload a phone performs on
//   its own whenever the browser reclaims the tab.
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

/**
 * FOR NOW, EVERY QUESTION IS 日本語 → 英語.
 *
 * The contract, the stored record and the quiz builder all still handle both
 * directions -- `vocab_attempts.direction` has them, `summarize` breaks results
 * down by them, and `buildQuiz` will mix them on request. What is switched off
 * is only the OFFER.
 *
 * WHY
 *   The two directions are not equally well served. Asked 「come from」, the
 *   answer is Japanese, and marking free text against a printed gloss means
 *   deciding whether 「〜を冷ます」 counts when the book prints 「〜を冷やす、冷ます」,
 *   or whether 「〜する用意ができている」 counts for 「〜する準備［用意］が…」.
 *   Every one of those judgements can be wrong about a reader who knew the
 *   answer, and a wrong one lands in 「間違えた問題だけ」 -- the list they trust
 *   most. Asked 「〜に由来する」, the answer is `come from`, and there is nothing
 *   to judge.
 *
 *   So the harder half is the one that ships. Turning the other back on is
 *   restoring this constant to a control; nothing else has to change.
 */
const QUIZ_DIRECTION: QuizDirectionSetting = 'ja_to_en';

const SCOPE_LABEL: Record<QuizScope, string> = {
  all: 'すべて',
  wrong: '間違えた問題だけ',
  // 「苦手」 rather than 「よく間違える問題」: three tabs share one row on a
  // 390px screen, and the two long labels beside each other wrapped every tab
  // onto two lines. The line under the tabs says what it means.
  weak: '苦手',
};

/** What each 出題範囲 actually selects, in one line, under the tabs. */
const SCOPE_HINT: Record<QuizScope, string> = {
  all: 'この Day の全問題です。',
  wrong: '最後に解いたとき間違えた問題だけを出します。復習して正解すると外れます。',
  // 「順番」ではなく「優先度」。このカードには 出題順 のヒントも出るので、
  // 「順番」という語が 1 画面で 2 つの別物 -- 選抜プールの中の優先度と、問題が
  // 出てくる順序 -- を指してしまう。読者が導く結論は「苦手の順位で順番が決まる
  // のか、ランダムなのか」で、しかも正しい答えは「ランキングは画面に届かない」。
  weak: `間違えやすい問題から最大 ${WEAK_QUIZ_LIMIT}問。復習して正解しても消えず、少しずつ優先度が下がります。`,
};

/**
 * Why the chosen 出題範囲 selected nothing.
 *
 * A `Record<QuizScope, string>` rather than a condition per scope: a range that
 * is empty and does not say why looks like a broken screen, and the range most
 * likely to be empty is whichever one was added last. The mapped type makes a
 * new scope answer this question rather than inherit somebody else's answer.
 *
 * 'all' cannot actually be empty -- every Day carries sixteen words -- but it
 * needs a line here anyway, and an honest one: if it ever IS empty, the content
 * is missing, not the reader's record.
 */
const SCOPE_EMPTY_REASON: Record<QuizScope, string> = {
  all: 'この Day には問題がありません。',
  wrong: 'この Day に間違えたままの問題はありません。',
  weak: 'この Day にはまだ間違えた問題がありません。',
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

/**
 * In what ORDER the questions come.
 *
 * 'No.順' rather than '本の順' because the number is what is printed beside each
 * entry and what the header of this screen already names (No.481〜560): the
 * reader matching the app against the open book is looking at that number, not
 * at a page.
 *
 * ランダム stays the default. A fixed order gets memorised AS an order --
 * 「3番目はいつも `be full of`」 -- and that reads as knowledge until the phrase
 * turns up anywhere else. No.順 exists for the reader working through the
 * printed book alongside the app, where the two not lining up is the friction
 * that ends the habit.
 */
const ORDER_LABEL: Record<QuizOrder, string> = {
  random: 'ランダム',
  number: 'No.順',
};

/**
 * What each 出題順 actually does, in one line, under the tabs -- the same shape
 * as SCOPE_HINT and for the same reason: two settings whose names describe the
 * ORDER cannot say, from their names, what that order costs.
 *
 * A `Record<QuizOrder, string>` so that a third order added to QUIZ_ORDERS has
 * to answer this here rather than inherit a line written about a different one.
 */
const ORDER_HINT: Record<QuizOrder, string> = {
  random: '毎回ちがう順番で出します。順番ごと覚えてしまわないので、ふだんはこちらです。',
  number: '本の No. 順に出します。本を開きながら進めるとき用です。',
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
  const pendingAttempts = useVocabStore((s) => s.pendingAttempts);
  const retryPending = useVocabStore((s) => s.retryPending);

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
  const direction = QUIZ_DIRECTION;
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

  const [order, setOrder] = useSearchParam<QuizOrder>({
    name: SEARCH_PARAMS.vocab.order,
    parse: parseEnumParam(QUIZ_ORDERS),
    fallback: 'random',
    serialize: (value) => value,
  });

  const [run, setRun] = useState<Run | null>(null);
  // 「記録を消す」 asks first. It is one click, it cannot be undone, and what it
  // destroys is the input to 「間違えた問題だけ」 -- a reader who wipes a Day by
  // accident has no way to tell which words they still had wrong.
  const [confirmingReset, setConfirmingReset] = useState(false);

  const dayWords = useMemo(() => wordsForDay(dayId), [dayId]);
  const selected = useMemo(
    () => selectWords(dayWords, progress, scope, direction),
    [dayWords, progress, scope, direction],
  );
  const daySummary = useMemo(
    () => summarize(dayWords, progress, direction),
    [dayWords, progress, direction],
  );
  // THE SAME DIRECTION AS THE DAY CARDS, not 'both'.
  //
  // Two figures on one screen computed over different scopes disagree in a way
  // the reader cannot explain: the header said 「16語に解答」 while every Day
  // card said 「未挑戦」, because the header counted answers in a direction the
  // quiz no longer asks. One scope, one set of numbers.
  const overall = useMemo(() => summarize(VOCAB_WORDS, progress, direction), [progress, direction]);

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
          order,
          seed: Date.now(),
        }),
        attempts: null,
        saved: false,
      });
    },
    [dayId, direction, order],
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
    void retryPending().then((saved) => setRun((current) => (current ? { ...current, saved } : current)));
  }, [retryPending]);

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
        {/* --- THE HEADLINE FIGURE IS 定着, AND THAT IS A CORRECTION.

            It used to be 全体の正答率 -- correct answers over every answer ever
            given -- shown directly above 要復習 and beside the 「間違えた問題だけ」
            control. The two cannot be read together. Someone who missed ten
            questions and then revised every one of them correctly sees 90%,
            while 要復習 is 0 and the review control is greyed out, and there is
            nothing on the screen that explains why. It is not recoverable
            either: the lifetime ratio can never return to 100% once a word has
            been missed, so that state is permanent.

            定着 counts the words whose MOST RECENT answer was right, over the
            words answered -- the same basis 「間違えた問題だけ」 selects on. 100%
            and 「要復習 0語」 are now the same statement, and the number goes UP
            when the reader fixes something, which is what they are revising for.

            The lifetime ratio is still shown, next to the answer count it is
            derived from and labelled 通算, because "how often was I right while
            learning this" is a real question -- just not the one the top of a
            study screen should be answering. --- */}
        <Card padding="md" className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] text-[var(--color-content-muted)]">定着</p>
            <p className="text-2xl font-semibold text-[var(--color-content-primary)]">
              {overall.retention === null ? '—' : `${Math.round(overall.retention * 100)}%`}
            </p>
            <p className="text-[10px] text-[var(--color-content-muted)]">
              最後の解答が正解だった語の割合
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
            <p className="text-sm text-[var(--color-content-secondary)]">
              {overall.attempts}回
              {overall.accuracy !== null && (
                <span className="ml-1 text-[var(--color-content-muted)]">
                  ・通算正答率 {Math.round(overall.accuracy * 100)}%
                </span>
              )}
            </p>
          </div>
        </Card>

        {/* Survives leaving the results screen -- which is the whole point of
            holding the run in the store. Without this the reader is never told
            again that answers went unrecorded. */}
        {pendingAttempts !== null && (
          <Card padding="md" className="mt-5 space-y-2 border-[var(--color-semantic-danger)]/40">
            <p className="text-sm font-medium text-[var(--color-semantic-danger)]">
              記録できていない解答が {pendingAttempts.length}問あります
            </p>
            <p className="text-xs text-[var(--color-content-secondary)]">
              「間違えた問題だけ」にはまだ反映されていません。
            </p>
            <Button size="sm" variant="secondary" onClick={() => void retryPending()}>
              もう一度記録する
            </Button>
          </Card>
        )}

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
                  // Disabled rather than hidden, and only when the scope would
                  // genuinely select nothing: a control that vanishes leaves the
                  // reader wondering where it went, and one that starts an empty
                  // quiz is worse.
                  //
                  // The two conditions are different questions and must stay
                  // that way. 'wrong' empties as soon as everything has been
                  // revised; 'weak' only empties on a Day where nothing has ever
                  // been missed. Collapsing them to one check would grey out 苦手
                  // for exactly the reader it exists for -- the one who revised
                  // everything and still wants the phrases that keep catching
                  // them out.
                  disabled:
                    (value === 'wrong' && daySummary.wrong === 0) ||
                    (value === 'weak' && daySummary.weak === 0),
                }))}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-[var(--color-content-muted)]">出題順</p>
              {/* NOT disabled for any 出題範囲.

                  It is tempting to grey this out for 「苦手」, whose selection is
                  already ranked by how often each word is missed -- but the
                  ranking chose WHICH ten words, and it never survived to the
                  screen anyway: buildQuiz has always shuffled what it was
                  handed. So No.順 here is a real, and the only, statement about
                  the order the reader actually sees. */}
              <Tabs
                ariaLabel="出題順"
                size="sm"
                value={order}
                onChange={setOrder}
                items={QUIZ_ORDERS.map((value) => ({
                  value,
                  label: ORDER_LABEL[value],
                }))}
              />
            </div>
          </div>

          <p className="text-xs text-[var(--color-content-secondary)]">
            日本語 → 英語・Day {dayId}・{SCOPE_LABEL[scope]}・{INPUT_MODE_LABEL[inputMode]}・
            {ORDER_LABEL[order]}・{selected.length}問
            {scope === 'wrong' && daySummary.wrong === 0 && (
              <span className="ml-1 text-[var(--color-semantic-success)]">
                （間違えた問題はありません）
              </span>
            )}
          </p>

          {/* WHAT THE CHOSEN RANGE SELECTS, ALWAYS -- not only when something is
              wrong. Three ranges that differ by which ANSWERS they look at
              cannot be told apart from their names, and 「間違えた問題だけ」 and
              「苦手」 are the pair a reader is most likely to assume are the same
              thing. */}
          <p className="text-[11px] text-[var(--color-content-muted)]">{SCOPE_HINT[scope]}</p>

          {/* AND WHAT THE CHOSEN 出題順 DOES, always -- not only for No.順.

              The two orders are not equally good for learning and the screen
              should not pretend otherwise: a fixed sequence is memorised as a
              sequence, and the reader finds out it was the sequence they learned
              only when they meet the phrase somewhere else. Shown for both, so
              the line is a description of the setting rather than a warning that
              appears when the reader picks the "wrong" one. */}
          <p className="text-[11px] text-[var(--color-content-muted)]">{ORDER_HINT[order]}</p>

          {/* AND WHY IT SELECTED NOTHING, when it did.

              A range can be empty while its tab is still selected -- the address
              carries `?scope=`, and switching Day keeps it, so 「苦手」 chosen on
              a studied Day survives a tap onto an untouched one. Before this the
              screen showed 「0問」 and a disabled 「クイズを始める」 with no reason
              anywhere on it. */}
          {selected.length === 0 && (
            <p className="text-[11px] text-[var(--color-content-muted)]">
              {SCOPE_EMPTY_REASON[scope]}
            </p>
          )}

          {/* SAY WHY THE CONTROL IS GREYED OUT.

              A disabled tab explains nothing, and the reason is genuinely not
              obvious: the reader may well remember getting questions wrong in
              this Day. What matters is that they went back and fixed them --
              「間違えた問題だけ」 selects on the MOST RECENT answer, so a word
              revised correctly leaves the set. Without this line the only other
              number in view was a percentage below 100, and the screen looked
              broken.

              「苦手」 is named separately because it is the answer to this note:
              it keeps the words that were ever missed, so it is still available
              when 「間違えた問題だけ」 has emptied. Pointing at it here is the
              difference between "nothing to do" and "here is the thing to do".

              Only once the Day has actually been answered; on an untouched Day
              an empty review set needs no explanation. */}
          {daySummary.wrong === 0 && daySummary.answered > 0 && (
            <p className="text-[11px] text-[var(--color-content-muted)]">
              このDayに間違えたままの問題はありません（最後の解答がすべて正解）。
              {daySummary.weak > 0
                ? '過去に間違えた問題を解き直すなら「苦手」を選んでください。'
                : '「間違えた問題だけ」は、次に間違えたときに選べるようになります。'}
            </p>
          )}

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
              onClick={() => setConfirmingReset(true)}
            >
              Day {dayId} の記録を消す
            </Button>
          </div>
        </Card>
      </LoadGate>

      <ConfirmDialog
        open={confirmingReset}
        destructive
        title={`Day ${dayId} の記録を消しますか`}
        description={`この Day の解答 ${daySummary.attempts}回分が消えます。要復習の ${daySummary.wrong}語も未挑戦に戻り、元には戻せません。`}
        confirmLabel="消す"
        onConfirm={() => {
          setConfirmingReset(false);
          void resetProgress(dayId);
        }}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}

export default VocabView;
