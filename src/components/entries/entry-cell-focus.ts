// ---------------------------------------------------------------------------
// MOVING DOWN A COLUMN WITH THE KEYBOARD.
//
// WHY THIS EXISTS
//   Recording a month's actuals means the same gesture twenty times: click a
//   cell, type, click the next cell. Enter already saved -- and then dropped the
//   user back to nothing, so the next cell needed the mouse again. Every other
//   ledger-shaped thing (a spreadsheet, a bank's CSV import screen) moves DOWN
//   on Enter, and the muscle memory people bring is the one worth matching.
//
//   Tab already moves through the whole row, which is the right behaviour for
//   Tab and the wrong one for this task: it walks sideways through the toggle
//   and the edit button on the way to the next amount.
//
// WHY IT GOES THROUGH THE DOM RATHER THAN THROUGH REFS
//   The next cell is in a DIFFERENT ROW, and the rows are rendered by
//   CategoryGroup inside CategoryGroupList -- three components up from the one
//   handling the key. Threading a ref registry through all of them would put
//   list-order bookkeeping into three files that otherwise know nothing about
//   each other, and it would go stale every time a row is filtered out.
//
//   The DOM already holds the answer, in exactly the order the user sees. What
//   it does NOT hold is which cell is "current" once the input has been replaced
//   by its button again -- which is why the caller passes the template id rather
//   than an element.
// ---------------------------------------------------------------------------

/** Which column is being walked. Matches `data-entry-cell` in the markup. */
export type EntryCell = 'planned' | 'actual';

/**
 * Starts editing the cell after (or before) `templateId` in the same column.
 *
 * Returns whether one was found, so a caller can leave the focus where it is at
 * the end of a list rather than wrapping around -- wrapping puts the caret at the
 * top of a screen the user has scrolled away from, which reads as the app
 * losing their place.
 *
 * `root` is injectable so a test can scope the query to its own render; in the
 * app there is exactly one entry list on screen.
 */
export function focusAdjacentCell(
  templateId: number,
  cell: EntryCell,
  direction: 1 | -1 = 1,
  root: ParentNode = document,
): boolean {
  const cells = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-entry-cell="${cell}"]`),
  );
  const index = cells.findIndex((el) => el.dataset.templateId === String(templateId));
  if (index < 0) return false;

  const next = cells[index + direction];
  if (!next) return false;

  // `click`, not `focus`: the cell is a button that swaps itself for an input,
  // and focusing the button would leave the user one more keystroke away from
  // typing. The input's own autofocus effect then takes over.
  next.click();
  return true;
}
