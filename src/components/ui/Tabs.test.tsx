import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { Tabs, type TabItem } from './Tabs';

const items: TabItem<'overview' | 'details' | 'history'>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'details', label: 'Details' },
  { value: 'history', label: 'History' },
];

describe('Tabs', () => {
  it('renders one role=tab per item', () => {
    renderWithProviders(
      <Tabs items={items} value="overview" onChange={vi.fn()} ariaLabel="Sections" />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(items.length);
  });

  it('marks the active tab with aria-selected=true', () => {
    renderWithProviders(
      <Tabs items={items} value="details" onChange={vi.fn()} ariaLabel="Sections" />,
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChange with the value of a clicked tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <Tabs items={items} value="overview" onChange={onChange} ariaLabel="Sections" />,
    );
    await user.click(screen.getByRole('tab', { name: 'History' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('history');
  });

  it('moves selection to the next tab on ArrowRight', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <Tabs items={items} value="overview" onChange={onChange} ariaLabel="Sections" />,
    );
    const activeTab = screen.getByRole('tab', { name: 'Overview' });
    activeTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('details');
  });
});
