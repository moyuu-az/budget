import type { CostType } from '../../types';

/**
 * The in-progress edit of one category row.
 *
 * Shared by the manager (which owns it) and the list (which renders it) so the
 * two cannot disagree about what is being edited -- they each declared their own
 * copy before 固定費/変動費 was added, which is exactly the kind of duplication
 * that lets a new field reach one component and not the other.
 */
export interface CategoryEditState {
  id: number;
  name: string;
  color: string;
  /** null for income categories and for expense categories left unclassified. */
  costType: CostType | null;
}
