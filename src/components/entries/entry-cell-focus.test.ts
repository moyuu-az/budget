import { describe, it, expect, afterEach } from 'vitest';
import { focusAdjacentCell } from './entry-cell-focus';

// ---------------------------------------------------------------------------
// Walking DOWN a column with Enter.
//
// Tested against a hand-built DOM rather than through EntryRow, because the
// behaviour is about ORDER ACROSS ROWS -- which rows exist, and which come
// first -- and building that from three levels of components would test the
// components rather than the traversal.
// ---------------------------------------------------------------------------

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

/** Two columns of three rows, in the order EntryRow renders them. */
const GRID = `
  <button data-entry-cell="planned" data-template-id="1"></button>
  <button data-entry-cell="actual"  data-template-id="1"></button>
  <button data-entry-cell="planned" data-template-id="2"></button>
  <button data-entry-cell="actual"  data-template-id="2"></button>
  <button data-entry-cell="planned" data-template-id="3"></button>
  <button data-entry-cell="actual"  data-template-id="3"></button>
`;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('moving down', () => {
  it('opens the SAME column of the next row', () => {
    // Not the next element in the DOM -- that is the same row's other column,
    // which is where Tab goes and is exactly what this exists not to do.
    const root = mount(GRID);
    const clicked: string[] = [];
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => clicked.push(`${b.dataset.entryCell}:${b.dataset.templateId}`)),
    );

    expect(focusAdjacentCell(1, 'planned', 1, root)).toBe(true);
    expect(clicked).toEqual(['planned:2']);
  });

  it('walks the actual column independently', () => {
    const root = mount(GRID);
    const clicked: string[] = [];
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => clicked.push(`${b.dataset.entryCell}:${b.dataset.templateId}`)),
    );

    focusAdjacentCell(2, 'actual', 1, root);
    expect(clicked).toEqual(['actual:3']);
  });

  it('stops at the end rather than wrapping to the top', () => {
    // Wrapping puts the caret at the top of a screen the user has scrolled away
    // from, which reads as the app losing their place.
    const root = mount(GRID);
    const clicked: string[] = [];
    root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => clicked.push('x')));

    expect(focusAdjacentCell(3, 'planned', 1, root)).toBe(false);
    expect(clicked).toEqual([]);
  });
});

describe('moving up', () => {
  it('opens the previous row of the same column', () => {
    const root = mount(GRID);
    const clicked: string[] = [];
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => clicked.push(`${b.dataset.entryCell}:${b.dataset.templateId}`)),
    );

    expect(focusAdjacentCell(3, 'planned', -1, root)).toBe(true);
    expect(clicked).toEqual(['planned:2']);
  });

  it('stops at the top', () => {
    const root = mount(GRID);
    expect(focusAdjacentCell(1, 'planned', -1, root)).toBe(false);
  });
});

describe('when the list has changed underneath', () => {
  it('follows the DOM, so a filtered-out row is simply not there', () => {
    // The reason this reads the DOM instead of a ref registry: the entry list is
    // narrowed to the month on screen, and a registry built when the rows
    // mounted would still name a row that is no longer rendered.
    const root = mount(`
      <button data-entry-cell="planned" data-template-id="1"></button>
      <button data-entry-cell="planned" data-template-id="3"></button>
    `);
    const clicked: string[] = [];
    root.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => clicked.push(b.dataset.templateId ?? '')),
    );

    focusAdjacentCell(1, 'planned', 1, root);
    expect(clicked).toEqual(['3']);
  });

  it('does nothing for a row that is not on screen at all', () => {
    const root = mount(GRID);
    expect(focusAdjacentCell(99, 'planned', 1, root)).toBe(false);
  });
});
