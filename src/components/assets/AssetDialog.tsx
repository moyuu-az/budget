import { useEffect, useState, type ReactElement } from 'react';
import type { Asset, AssetCategory, AssetInput } from '../../types';
import { MAX_ASSET_VALUE, hasNoErrors, validateFieldValues } from '../../../shared/asset-fields';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface Props {
  open: boolean;
  /** The category whose shape this holding follows. */
  category: AssetCategory;
  /** The holding being edited, or null to add one. */
  asset: Asset | null;
  onSubmit: (input: AssetInput) => Promise<boolean>;
  onClose: () => void;
}

/** Form state is all strings, because that is what an <input> produces. */
type Draft = Record<string, string>;

function toDraft(asset: Asset | null): Draft {
  const draft: Draft = {};
  if (!asset) return draft;
  for (const [key, value] of Object.entries(asset.fields)) {
    draft[key] = value === null ? '' : String(value);
  }
  return draft;
}

/**
 * Add / edit one holding.
 *
 * The inputs below the name and value are NOT hard-coded: they are generated
 * from the category's field definitions, which is the whole reason a category
 * carries a shape. A household that adds 「口座番号」 to its 現金 category gets
 * the input here without a code change.
 */
function AssetDialog({ open, category, asset, onSubmit, onClose }: Props): ReactElement {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // category.id is in the dependency list even though the dialog is currently
  // mounted per category: moving from one category's "add" dialog straight to
  // another's without unmounting would otherwise keep the first one's draft,
  // under inputs generated from the second one's definitions.
  useEffect(() => {
    if (!open) return;
    setName(asset?.name ?? '');
    setValue(asset ? String(asset.value) : '');
    setDraft(toDraft(asset));
    setErrors({});
  }, [open, asset, category.id]);

  const handleSubmit = async (): Promise<void> => {
    const nextErrors: Record<string, string> = {};

    const trimmedName = name.trim();
    if (trimmedName === '') nextErrors.name = '資産名は必須です';

    // Number(''), which is 0, would silently save a blank box as zero.
    const parsedValue = value.trim() === '' ? Number.NaN : Number(value.trim());
    if (!Number.isFinite(parsedValue)) {
      nextErrors.value = '評価額は数値で入力してください';
    } else if (!Number.isInteger(parsedValue)) {
      // Whole yen only -- see assetInputSchema for why a fraction of a yen
      // makes the figures on two screens disagree.
      nextErrors.value = '評価額は円単位（整数）で入力してください';
    } else if (Math.abs(parsedValue) > MAX_ASSET_VALUE) {
      // The same bound the server enforces, from the same module. Left to the
      // server it would come back as a redacted generic failure; said here it
      // names the field and the reason.
      nextErrors.value = '評価額が大きすぎます';
    }

    // The category's own rules, from the module the server also runs.
    const { values, errors: fieldErrors } = validateFieldValues(category.fields, draft);
    Object.assign(nextErrors, fieldErrors);

    if (!hasNoErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    const ok = await onSubmit({
      categoryId: category.id,
      name: trimmedName,
      value: parsedValue,
      // Always sent, even when empty: the server rewrites `fields` on every
      // update, so omitting it would be a different request, not a shorter one.
      fields: values,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={asset ? `${category.name}の資産を編集` : `${category.name}に資産を追加`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="資産名"
          value={name}
          placeholder="つみたて投資枠"
          error={errors.name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="評価額"
          value={value}
          inputMode="numeric"
          placeholder="1000000"
          prefix="¥"
          hint="円単位。住宅ローン残高などは負の値で入力できます"
          error={errors.value}
          onChange={(e) => setValue(e.target.value)}
        />

        {category.fields.map((def) => (
          <Input
            key={def.key}
            label={def.required ? `${def.label} *` : def.label}
            value={draft[def.key] ?? ''}
            type={def.type === 'date' ? 'date' : 'text'}
            inputMode={def.type === 'number' ? 'numeric' : undefined}
            suffix={def.unit ?? undefined}
            error={errors[def.key]}
            onChange={(e) => setDraft({ ...draft, [def.key]: e.target.value })}
          />
        ))}
      </div>
    </Dialog>
  );
}

export default AssetDialog;
