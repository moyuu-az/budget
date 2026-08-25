import { useState, type ReactElement } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadGate } from '../ui/LoadGate';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useToastStore } from '../../stores/useToastStore';
import { MAX_MIN_BALANCE_THRESHOLD } from '../../../shared/ledger-settings';
import { formatWithCommas, handleCurrencyInput, parseCommaNumber } from '../../utils/currency';

// ---------------------------------------------------------------------------
// 最低残高 -- the floor this household wants to stay above.
//
// WHY IT IS A SETTING AND NOT A CONSTANT
//   It was `50000`, hard-coded in KpiHero. Everything the dashboard calls
//   「安全」 or 「注意」 was measured against it, 使っていい額 is what is left
//   above it, and 残高がもつ期間 counts to it -- so one household's comfortable
//   floor was another household's rent, and nothing on screen said where the
//   number came from or how to change it.
//
// WHY THE FORM WAITS FOR THE FETCH
//   The store starts at the DEFAULT, which is the right answer for reading (see
//   useSettingsStore). It is the wrong answer to pre-fill a form with: a field
//   showing 50,000 while the ledger's real 300,000 is still in flight would
//   overwrite that figure the moment someone pressed save without noticing.
// ---------------------------------------------------------------------------

function MinBalanceSetting(): ReactElement {
  const settings = useSettingsStore((s) => s.settings);
  const status = useSettingsStore((s) => s.status);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const addToast = useToastStore((s) => s.addToast);

  // Local text, committed on save. Formatting on every keystroke against the
  // stored value would fight the user the way the recurrence fields did before
  // they held their own text.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (status !== 'ready') {
    return (
      <Card padding="lg">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-content-primary)]">最低残高</h2>
        <LoadGate status={status} height={72} label="最低残高" />
      </Card>
    );
  }

  const value = draft ?? formatWithCommas(settings.minBalanceThreshold);
  const parsed = parseCommaNumber(value);
  // EMPTY IS CHECKED SEPARATELY, and this is the whole reason the check is not
  // just `Number.isNaN(parsed)`: parseCommaNumber('') returns 0, not NaN. A
  // blank box would therefore save as 「マイナスになるときだけ警告」 -- a
  // meaningful setting, silently chosen by someone who was mid-retype.
  const empty = value.trim() === '';
  const invalid = empty || Number.isNaN(parsed) || parsed < 0 || parsed > MAX_MIN_BALANCE_THRESHOLD;
  const dirty = draft !== null && parsed !== settings.minBalanceThreshold;

  const handleSave = async (): Promise<void> => {
    if (invalid) return;
    setSaving(true);
    const saved = await updateSettings({ minBalanceThreshold: parsed });
    setSaving(false);
    if (!saved) return;
    // Back to the STORED value, which is not always what was typed -- the server
    // clamps. Keeping the draft would leave a figure on screen the database does
    // not hold, and it would change on the next reload.
    setDraft(null);
    addToast('最低残高を保存しました', 'success');
  };

  return (
    <Card padding="lg">
      <h2 className="mb-1 text-lg font-semibold text-[var(--color-content-primary)]">最低残高</h2>
      <p className="mb-4 text-xs text-[var(--color-content-secondary)]">
        この金額を下回りそうなときに警告します。「使っていい額」はこの金額を残した上での
        残りです。0 にすると、マイナスになるときだけ警告します。
      </p>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="min-balance-threshold"
            className="mb-1 block text-xs text-[var(--color-content-muted)]"
          >
            金額
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-content-muted)]">
              ¥
            </span>
            <input
              id="min-balance-threshold"
              type="text"
              inputMode="numeric"
              value={value}
              disabled={saving}
              onChange={(e) => setDraft(handleCurrencyInput(e.target.value))}
              aria-invalid={invalid}
              className="w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] py-2 pl-7 pr-3 text-sm tabular-nums text-[var(--color-content-primary)] transition-colors focus:border-[var(--color-accent-primary)] focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <Button variant="primary" onClick={handleSave} disabled={saving || invalid || !dirty}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      {invalid && (
        <p role="alert" className="mt-2 text-xs text-[var(--color-semantic-danger)]">
          0 以上の金額を入力してください
        </p>
      )}
    </Card>
  );
}

export default MinBalanceSetting;
