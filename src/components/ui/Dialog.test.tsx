import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/helpers';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('is not in the DOM when open=false', () => {
    renderWithProviders(
      <Dialog open={false} onClose={vi.fn()} title="My Dialog">
        <p>Body content</p>
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('My Dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('renders title, children and role=dialog when open', () => {
    renderWithProviders(
      <Dialog open onClose={vi.fn()} title="My Dialog">
        <p>Body content</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('My Dialog')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <Dialog open onClose={onClose} title="My Dialog">
        <p>Body content</p>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
