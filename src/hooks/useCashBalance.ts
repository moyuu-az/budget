import { useMemo } from 'react';
import { useAssetStore } from '../stores/useAssetStore';
import { cashTotal } from '../utils/net-worth';

// ---------------------------------------------------------------------------
// 現在の残高.
//
// There is no balance store, and no getBalance call. The balance IS the sum of
// the cash category's holdings, so it is derived from the asset store and
// nowhere else -- which is what makes it impossible for the number in the
// sidebar to disagree with the number on the 資産 screen.
//
// The store this reads is the one the 資産 screen mutates, so editing a holding
// updates the sidebar, the KPIs and the forecast in the same render. Under the
// old shape those were separate fetches and could sit out of step until a
// reload.
//
// If you need the balance anywhere, call this. If you need the parts as well
// (the 純資産 breakdown), call summarizeHoldings instead -- it is the same
// arithmetic, kept in the same module for that reason.
// ---------------------------------------------------------------------------

export function useCashBalance(): number {
  const categories = useAssetStore((s) => s.categories);
  const assets = useAssetStore((s) => s.assets);

  return useMemo(() => cashTotal(categories, assets), [categories, assets]);
}
