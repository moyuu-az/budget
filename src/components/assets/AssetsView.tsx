import { useMemo, useState, type ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { Asset, AssetCategory, AssetCategoryInput, AssetInput } from '../../types';
import type { AssetCategoryTemplate } from '../../../shared/asset-templates';
import { useAssetStore, assetsOfCategory } from '../../stores/useAssetStore';
import { totalAssetValue } from '../../utils/net-worth';
import { useToastStore } from '../../stores/useToastStore';
import { Card } from '../ui/Card';
import { formatYen as yen } from '../../utils/currency';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import AssetCategoryCard from './AssetCategoryCard';
import AssetCategoryDialog from './AssetCategoryDialog';
import AssetDialog from './AssetDialog';
import AssetTemplatePicker from './AssetTemplatePicker';

/** What the category dialog is currently doing. `null` means it is closed. */
interface CategoryDialogState {
  category: AssetCategory | null;
  initial: AssetCategoryInput | null;
}

/** What the holding dialog is currently doing. */
interface AssetDialogState {
  category: AssetCategory;
  asset: Asset | null;
}


/**
 * 資産.
 *
 * EVERY LEDGER HAS A 現金 CATEGORY, and its holdings are 現在の残高 -- the figure
 * the whole forecast starts from. The server provisions it on read, so this view
 * never sees a ledger without one once the fetch has landed, and the card for it
 * offers no delete button (AssetCategoryCard).
 *
 * Everything else stays optional: a household that ignores investments sees one
 * category with one row in it, which is what it had before under the name
 * 「現在の残高」.
 */
function AssetsView(): ReactElement {
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);
  const loading = useAssetStore((s) => s.loading);
  const addCategory = useAssetStore((s) => s.addCategory);
  const updateCategory = useAssetStore((s) => s.updateCategory);
  const deleteCategory = useAssetStore((s) => s.deleteCategory);
  const addAsset = useAssetStore((s) => s.addAsset);
  const updateAsset = useAssetStore((s) => s.updateAsset);
  const deleteAsset = useAssetStore((s) => s.deleteAsset);
  const addToast = useToastStore((s) => s.addToast);

  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState | null>(null);
  const [assetDialog, setAssetDialog] = useState<AssetDialogState | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<AssetCategory | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [categories],
  );
  const total = useMemo(() => totalAssetValue(assets), [assets]);

  // Only the toast is decided here. The error toast, if any, was already raised
  // by the store's single error choke point -- saying it twice would stack two
  // toasts for one failure.
  const notify = (ok: boolean, message: string): void => {
    if (ok) addToast(message, 'success');
  };

  const handleSubmitCategory = async (input: AssetCategoryInput): Promise<boolean> => {
    const editing = categoryDialog?.category ?? null;
    const ok = editing
      ? await updateCategory(editing.id, input)
      : await addCategory(input);
    notify(ok, editing ? '資産分類を更新しました' : '資産分類を追加しました');
    return ok;
  };

  const handleSubmitAsset = async (input: AssetInput): Promise<boolean> => {
    const editing = assetDialog?.asset ?? null;
    const ok = editing ? await updateAsset(editing.id, input) : await addAsset(input);
    notify(ok, editing ? '資産を更新しました' : '資産を追加しました');
    return ok;
  };

  // Both confirmations close BEFORE awaiting. The confirm button has no busy
  // state, so leaving the dialog open across the round trip lets a second click
  // fire a second delete -- harmless on the server (DELETE is idempotent) but it
  // reports success twice, which reads like something happened twice.
  const handleDeleteCategory = async (): Promise<void> => {
    if (!categoryToDelete) return;
    const target = categoryToDelete;
    setCategoryToDelete(null);
    notify(await deleteCategory(target.id), '資産分類を削除しました');
  };

  const handleDeleteAsset = async (): Promise<void> => {
    if (!assetToDelete) return;
    const target = assetToDelete;
    setAssetToDelete(null);
    notify(await deleteAsset(target.id), '資産を削除しました');
  };

  const startFromTemplate = (template: AssetCategoryTemplate): void => {
    setCategoryDialog({
      category: null,
      // A template is a starting draft, not a commitment: the dialog opens
      // pre-filled and the user can change anything before it is created.
      initial: { name: template.name, color: template.color, fields: template.fields },
    });
  };

  const deletingCount = categoryToDelete
    ? assetsOfCategory(assets, categoryToDelete.id).length
    : 0;

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-content-primary)]">資産</h1>
          <p className="text-sm text-[var(--color-content-muted)]">
            「現金」の合計が現在の残高です。NISA などは分類ごとに必要な項目を決めて記録します。
          </p>
        </div>
        {sortedCategories.length > 0 && (
          <div className="flex items-center gap-4">
            {/* A definition list rather than two <p>s: the pair really is a
                label and its value, and it gives the figure an accessible role
                so it can be found without depending on the layout around it. */}
            <dl className="text-right">
              <dt className="text-xs text-[var(--color-content-muted)]">総資産</dt>
              <dd className="text-xl font-bold tabular-nums text-[var(--color-content-primary)]">
                {yen(total)}
              </dd>
            </dl>
            <Button onClick={() => setCategoryDialog({ category: null, initial: null })}>
              分類を追加
            </Button>
          </div>
        )}
      </header>

      {/* An empty list now means "not loaded yet", not "not used": the server
          provisions the 現金 category on read, so after the fetch there is always
          at least one card. The old empty state offering the 雛形 would be
          unreachable, and showing it during the fetch would tell the user their
          data is gone. */}
      {sortedCategories.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="読み込み中"
            description="資産の分類を読み込んでいます。"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((category) => (
            <AssetCategoryCard
              key={category.id}
              category={category}
              assets={assetsOfCategory(assets, category.id)}
              onAddAsset={() => setAssetDialog({ category, asset: null })}
              onEditAsset={(asset) => setAssetDialog({ category, asset })}
              onDeleteAsset={setAssetToDelete}
              onEditCategory={() => setCategoryDialog({ category, initial: null })}
              onDeleteCategory={() => setCategoryToDelete(category)}
            />
          ))}

          {/* Still reachable after the first category exists. A household that
              started with 現金 and later wants the NISA shape should not have to
              retype it because the picker only ever appeared on an empty view. */}
          <details className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
            <summary className="cursor-pointer text-sm text-[var(--color-content-secondary)]">
              雛形から分類を追加
            </summary>
            <div className="mt-3">
              <AssetTemplatePicker onPick={startFromTemplate} />
            </div>
          </details>
        </div>
      )}

      {loading && sortedCategories.length === 0 && (
        <p className="sr-only" role="status">
          読み込み中
        </p>
      )}

      <AssetCategoryDialog
        open={categoryDialog !== null}
        category={categoryDialog?.category ?? null}
        initial={categoryDialog?.initial ?? null}
        holdingCount={
          categoryDialog?.category
            ? assetsOfCategory(assets, categoryDialog.category.id).length
            : 0
        }
        onSubmit={handleSubmitCategory}
        onClose={() => setCategoryDialog(null)}
      />

      {assetDialog && (
        <AssetDialog
          open
          category={assetDialog.category}
          asset={assetDialog.asset}
          onSubmit={handleSubmitAsset}
          onClose={() => setAssetDialog(null)}
        />
      )}

      <ConfirmDialog
        open={categoryToDelete !== null}
        title="資産分類を削除"
        // Stated plainly because it is not recoverable: the holdings go with the
        // category (ON DELETE CASCADE), since their parameter values would have
        // no definitions left to interpret them.
        description={
          deletingCount > 0
            ? `「${categoryToDelete?.name}」に登録された ${deletingCount} 件の資産も一緒に削除されます。この操作は取り消せません。`
            : `「${categoryToDelete?.name}」を削除します。この操作は取り消せません。`
        }
        confirmLabel="削除"
        destructive
        onConfirm={handleDeleteCategory}
        onCancel={() => setCategoryToDelete(null)}
      />

      <ConfirmDialog
        open={assetToDelete !== null}
        title="資産を削除"
        description={`「${assetToDelete?.name}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除"
        destructive
        onConfirm={handleDeleteAsset}
        onCancel={() => setAssetToDelete(null)}
      />
    </motion.div>
  );
}

export default AssetsView;
