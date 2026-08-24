import type { ReactElement } from 'react';
import type { AssetFieldDef, AssetFieldType } from '../../types';
import {
  MAX_ASSET_FIELDS,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_UNIT_LENGTH,
  nextFieldKey,
} from '../../../shared/asset-fields';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { IconButton } from '../ui/IconButton';

interface Props {
  defs: AssetFieldDef[];
  onChange: (defs: AssetFieldDef[]) => void;
  /** Keyed by field key, plus '_' for problems with the list as a whole. */
  errors: Record<string, string>;
}

const TYPE_OPTIONS: { value: AssetFieldType; label: string }[] = [
  { value: 'text', label: 'テキスト' },
  { value: 'number', label: '数値' },
  { value: 'date', label: '日付' },
];

/**
 * Edits the PARAMETERS a category requires of its holdings -- 銘柄, 保有数量, ...
 *
 * The key of an existing row is never touched. Renaming 「銘柄」 to 「銘柄名」
 * has to keep every holding's stored value attached to it, and the key is what
 * does that (see AssetFieldDef in shared/asset-fields.ts). Only adding a row
 * mints a key, and only removing one retires it.
 */
function AssetFieldDefsEditor({ defs, onChange, errors }: Props): ReactElement {
  const update = (key: string, patch: Partial<AssetFieldDef>): void => {
    onChange(defs.map((def) => (def.key === key ? { ...def, ...patch } : def)));
  };

  const add = (): void => {
    onChange([
      ...defs,
      { key: nextFieldKey(defs), label: '', type: 'text', required: false, unit: null },
    ]);
  };

  const remove = (key: string): void => {
    // Holdings keep whatever they stored for this key until they are next
    // saved; nothing is destroyed by removing a definition here.
    onChange(defs.filter((def) => def.key !== key));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--color-content-secondary)]">
          パラメータ
          <span className="ml-2 text-xs font-normal text-[var(--color-content-muted)]">
            この分類の資産ごとに記録する項目
          </span>
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={add}
          disabled={defs.length >= MAX_ASSET_FIELDS}
        >
          パラメータを追加
        </Button>
      </div>

      {errors._ && (
        <p role="alert" className="text-xs text-[var(--color-semantic-danger)]">
          {errors._}
        </p>
      )}

      {defs.length === 0 ? (
        <p className="text-xs text-[var(--color-content-muted)]">
          パラメータなし（資産名と評価額だけを記録します）
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {defs.map((def, index) => (
            // Every row shows the same four captions (項目名 / 種類 / 単位 / 必須),
            // so on their own they say nothing about WHICH parameter is being
            // edited. The group name is what a screen reader announces on entry.
            <li
              key={def.key}
              role="group"
              aria-label={def.label.trim() || `パラメータ ${index + 1}`}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="min-w-[9rem] flex-1">
                <Input
                  label="項目名"
                  value={def.label}
                  maxLength={MAX_FIELD_LABEL_LENGTH}
                  placeholder="銘柄"
                  error={errors[def.key]}
                  onChange={(e) => update(def.key, { label: e.target.value })}
                />
              </div>
              <div className="w-28">
                <Select
                  label="種類"
                  value={def.type}
                  options={TYPE_OPTIONS}
                  onChange={(e) => update(def.key, { type: e.target.value as AssetFieldType })}
                />
              </div>
              <div className="w-20">
                <Input
                  label="単位"
                  value={def.unit ?? ''}
                  maxLength={MAX_FIELD_UNIT_LENGTH}
                  placeholder="円"
                  // Empty means "no unit"; storing '' would render a stray space
                  // after every value.
                  onChange={(e) => update(def.key, { unit: e.target.value || null })}
                />
              </div>
              <label className="flex h-10 items-center gap-1.5 text-sm text-[var(--color-content-secondary)]">
                <input
                  type="checkbox"
                  checked={def.required}
                  onChange={(e) => update(def.key, { required: e.target.checked })}
                />
                必須
              </label>
              <IconButton
                label={`${def.label || 'パラメータ'}を削除`}
                tone="danger"
                onClick={() => remove(def.key)}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AssetFieldDefsEditor;
