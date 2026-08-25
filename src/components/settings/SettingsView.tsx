import { motion } from 'framer-motion';
import type { ViewType } from '../../types';
import { Card } from '../ui/Card';
import CashBalance from '../sidebar/CashBalance';
import CategoryManager from './CategoryManager';
import MinBalanceSetting from './MinBalanceSetting';
import { useSessionStore } from '../../stores/useSessionStore';

interface Props {
  /** Lets the balance card send the user to 資産, where the figure is edited. */
  onNavigate?: (view: ViewType) => void;
}

function SettingsView({ onNavigate }: Props) {
  // Keyed by ledger so switching REMOUNTS the form, discarding whatever was
  // half-typed into it.
  //
  // Without this, editing ledger A's floor and switching to B before saving
  // leaves the draft in place: the form is hidden while B loads, comes back
  // holding A's number, and pressing 保存 writes it to B under B's header.
  // Clearing the draft from an effect would work and would also be one more
  // thing to remember for the next field added here; a key cannot be forgotten.
  const activeLedgerId = useSessionStore((s) => s.activeLedgerId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="text-2xl font-bold text-white mb-6">設定</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-white mb-4">残高</h2>
          {/* The sidebar has the same card, but it is hidden while the sidebar
              is collapsed -- which left this screen with no way at all to reach
              the holdings the figure is made of. */}
          <CashBalance onEdit={onNavigate ? () => onNavigate('assets') : undefined} />
        </Card>
        {/* Beside the balance on purpose: the floor is a statement ABOUT that
            figure, and reading them together is how someone decides what the
            floor should be. */}
        <MinBalanceSetting key={activeLedgerId ?? 'none'} />
        <CategoryManager />
      </div>
    </motion.div>
  );
}

export default SettingsView;
