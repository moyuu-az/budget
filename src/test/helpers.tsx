import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

// Zustand stores are accessed directly via hooks (no Context), so providers stay minimal.
export const renderWithProviders = (ui: ReactElement, options?: RenderOptions): RenderResult => {
  return render(ui, options);
};

