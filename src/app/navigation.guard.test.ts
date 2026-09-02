import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// ONE PLACE WRITES HISTORY.
//
// src/app/navigation.ts owns `pushState` / `replaceState` because React has to
// be TOLD the address moved -- `pushState` fires no event of its own. A call
// anywhere else moves the address bar and leaves the screen behind it unchanged:
// the URL says 分析, the page shows 資産, and nothing errors.
//
// That rule is stated in navigation.ts and nowhere enforced, which is how the
// same class of drift got into shared/asset-fields.ts. This is the enforcement.
//
// Tests are exempt: they stand in for the browser (setting up a deep link,
// performing the half of the back button that happy-dom does not).
// ---------------------------------------------------------------------------

const ALLOWED = new Set([
  'src/app/navigation.ts',
  // Test infrastructure, exempt for the same reason the test files are: it
  // stands in for the browser, resetting the address between tests so one
  // test's `?month=` is not the next one's silent filter.
  'src/test/setup.ts',
]);

const isTestFile = (file: string): boolean => /\.(test|spec)\.tsx?$/.test(file);

describe('history is written in one place', () => {
  it('is not pushed or replaced outside src/app/navigation.ts', () => {
    // grep exits 1 when nothing matches, which is the healthy case for a
    // repository that has only the one caller plus its tests.
    let output = '';
    try {
      output = execFileSync(
        'grep',
        ['-rln', '-E', 'history\\.(push|replace)State', 'src', 'server', 'shared'],
        { encoding: 'utf8' },
      );
    } catch {
      output = '';
    }

    const offenders = output
      .split('\n')
      .filter(Boolean)
      .filter((file) => !ALLOWED.has(file) && !isTestFile(file));

    expect(offenders).toEqual([]);
  });
});
