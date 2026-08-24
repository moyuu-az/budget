import { useEffect, useState, type ReactElement } from 'react';
import type { AssetCategory, AssetCategoryInput, AssetFieldDef } from '../../types';
import { hasNoErrors, validateFieldDefs } from '../../../shared/asset-fields';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import ColorPicker from '../settings/ColorPicker';
import AssetFieldDefsEditor from './AssetFieldDefsEditor';

interface Props {
  open: boolean;
  /** The category being edited, or null to create a new one. */
  category: AssetCategory | null;
  /** Pre-filled draft for "start from a template"; ignored when editing. */
  initial?: AssetCategoryInput | null;
  onSubmit: (input: AssetCategoryInput) => Promise<boolean>;
  onClose: () => void;
}

const DEFAULT_COLOR = '#8b5cf6';

/**
 * Create / edit one asset category: its name, colour, and the parameters it
 * requires of its holdings.
 *
 * The same dialog serves both, because the fields are identical and a separate
 * "edit" component is how the two drift -- a validation rule added to one and
 * not the other.
 */
function AssetCategoryDialog({ open, category, initial, onSubmit, onClose }: Props): ReactElement {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [fields, setFields] = useState<AssetFieldDef[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-seeded whenever the dialog opens for a different subject. Without the
  // `open` dependency, closing and reopening on the same category would show
  // whatever half-finished edit was abandoned last time.
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? initial?.name ?? '');
    setColor(category?.color ?? initial?.color ?? DEFAULT_COLOR);
    setFields(category?.fields ?? initial?.fields ?? []);
    setErrors({});
  }, [open, category, initial]);

  const handleSubmit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setErrors({ name: '分類名は必須です' });
      return;
    }

    // The same validator the server runs, so the form cannot accept a shape the
    // request would then be rejected for.
    const { errors: fieldErrors } = validateFieldDefs(fields);
    if (!hasNoErrors(fieldErrors)) {
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const ok = await onSubmit({
      name: trimmed,
      color,
      // Labels are trimmed here rather than while typing: trimming on every
      // keystroke makes a space impossible to type in the middle of a label.
      fields: fields.map((def) => ({ ...def, label: def.label.trim() })),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? '資産分類を編集' : '資産分類を追加'}
      description="この分類の資産ごとに記録したい項目を決めます（例: NISA なら銘柄や取得単価）。"
      size="lg"
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
      <div className="flex flex-col gap-5">
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-content-secondary)]">色</span>
            <ColorPicker
              value={color}
              onChange={setColor}
              className="h-10 w-10 cursor-pointer rounded border-0 bg-transparent"
            />
          </div>
          <div className="flex-1">
            <Input
              label="分類名"
              value={name}
              placeholder="NISA"
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <AssetFieldDefsEditor defs={fields} onChange={setFields} errors={errors} />
      </div>
    </Dialog>
  );
}

export default AssetCategoryDialog;
