import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { Asset, AssetCategory } from '../../types';
import { formatFieldValue } from '../../../shared/asset-fields';
import { Card } from '../ui/Card';
import { formatYen as yen } from '../../utils/currency';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

interface Props {
  category: AssetCategory;
  assets: Asset[];
  onAddAsset: () => void;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (asset: Asset) => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
}


/**
 * One asset category and its holdings.
 *
 * The table's columns come from the category's field definitions, so two
 * categories on the same screen legitimately show different columns -- which is
 * the point: 銘柄 and 取得単価 belong to NISA and would be empty noise on 現金.
 */
function AssetCategoryCard({
  category,
  assets,
  onAddAsset,
  onEditAsset,
  onDeleteAsset,
  onEditCategory,
  onDeleteCategory,
}: Props): ReactElement {
  const subtotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  // The cash category IS 現在の残高. Deleting it would zero the balance and the
  // forecast with it, so the button is not offered -- and the server refuses the
  // call as well, because hiding a button is not an invariant.
  const isCash = category.kind === 'cash';

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card padding="lg" className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: category.color ?? '#8b5cf6' }}
          />
          <h2 className="text-base font-semibold text-[var(--color-content-primary)]">
            {category.name}
          </h2>
          {isCash && (
            <span className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] text-[var(--color-content-muted)]">
              現在の残高
            </span>
          )}
          <span className="text-sm tabular-nums text-[var(--color-content-secondary)]">
            {yen(subtotal)}
          </span>
          <span className="text-xs text-[var(--color-content-muted)]">{assets.length} 件</span>

          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="secondary" onClick={onAddAsset}>
              資産を追加
            </Button>
            <IconButton
              label={`${category.name}の分類を編集`}
              size="sm"
              onClick={onEditCategory}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            />
            {!isCash && (
              <IconButton
                label={`${category.name}の分類を削除`}
                size="sm"
                tone="danger"
                onClick={onDeleteCategory}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                }
              />
            )}
          </div>
        </header>

        {assets.length === 0 ? (
          <p className="px-1 text-sm text-[var(--color-content-muted)]">
            {isCash
              ? '手元の現金や口座残高を追加すると、残高予測の起点になります。'
              : 'まだ資産が登録されていません。'}
          </p>
        ) : (
          // Horizontal scrolling belongs to the table, not the page: a category
          // with several parameters must not make the whole view scroll sideways.
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-content-muted)]">
                  <th className="py-1 pr-3 font-medium">名称</th>
                  {category.fields.map((def) => (
                    <th key={def.key} className="py-1 pr-3 font-medium">
                      {def.label}
                    </th>
                  ))}
                  <th className="py-1 pr-3 text-right font-medium">評価額</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="border-t border-[var(--color-border-subtle)] text-[var(--color-content-secondary)]"
                  >
                    <td className="py-2 pr-3 text-[var(--color-content-primary)]">{asset.name}</td>
                    {category.fields.map((def) => (
                      <td key={def.key} className="py-2 pr-3 tabular-nums">
                        {formatFieldValue(def, asset.fields[def.key] ?? null)}
                      </td>
                    ))}
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--color-content-primary)]">
                      {yen(asset.value)}
                    </td>
                    <td className="py-1">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={`${asset.name}を編集`}
                          size="sm"
                          onClick={() => onEditAsset(asset)}
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          }
                        />
                        <IconButton
                          label={`${asset.name}を削除`}
                          size="sm"
                          tone="danger"
                          onClick={() => onDeleteAsset(asset)}
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default AssetCategoryCard;
