import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setupMockApi } from './mock-api';

setupMockApi();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // THE ADDRESS BAR IS SHARED STATE BETWEEN TESTS.
  //
  // Screens now read the month and the period out of the URL, so a test that
  // navigated (or deep-linked) would leave `?month=2026-01` behind for whatever
  // ran next -- which would then quietly assert against a month it never chose.
  // Reset rather than isolate: happy-dom gives the whole file one `window`.
  if (typeof window !== 'undefined') window.history.replaceState(null, '', '/');
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}
