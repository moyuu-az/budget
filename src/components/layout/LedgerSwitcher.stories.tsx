import type { Meta, StoryObj } from '@storybook/react-vite';
import LedgerSwitcher from './LedgerSwitcher';
import { useSessionStore } from '../../stores/useSessionStore';
import type { Session } from '../../types';

const session = (ledgers: Session['ledgers']): Session => ({
  user: { id: 1, email: 'alice@example.test', displayName: 'alice' },
  ledgers,
});

const meta = {
  title: 'Layout/LedgerSwitcher',
  component: LedgerSwitcher,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LedgerSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both members of the household plus a private ledger. */
export const SharedAndPersonal: Story = {
  decorators: [
    (Story) => {
      useSessionStore.getState().setSession(
        session([
          { id: 10, slug: 'shared', name: '家計', kind: 'shared' },
          { id: 20, slug: 'personal:1', name: 'alice', kind: 'personal' },
        ]),
      );
      return <Story />;
    },
  ],
};

/** With nothing to switch between, the control renders nothing at all. */
export const SingleLedgerRendersNothing: Story = {
  decorators: [
    (Story) => {
      useSessionStore.setState({ session: null, activeLedgerId: null });
      useSessionStore
        .getState()
        .setSession(session([{ id: 10, slug: 'shared', name: '家計', kind: 'shared' }]));
      return <Story />;
    },
  ],
};
