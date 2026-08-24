// ---------------------------------------------------------------------------
// Money on screen.
//
// formatYen / formatSignedYen are THE way an amount is rendered. They lived as
// near-identical private copies in three components, and the copies drifted the
// moment one of them changed its rounding -- the dashboard showed ¥202 for two
// holdings of 100.5 while the 資産 screen showed ¥201 for the same data.
//
// Rounding happens here and nowhere else. Nothing upstream should round on its
// own: two roundings from different starting points is exactly how the figures
// on one screen stop adding up to the figures on another.
// ---------------------------------------------------------------------------

/** '¥1,200' / '-¥1,200'. Rounds to whole yen for display. */
export function formatYen(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
}

/** Same, but a positive amount keeps its '+'. For deltas and slopes. */
export function formatSignedYen(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}¥${Math.abs(Math.round(amount)).toLocaleString('ja-JP')}`;
}

// Format a number with commas (e.g., 1000000 → "1,000,000")
export function formatWithCommas(value: number | string): string {
  const num = typeof value === 'string' ? value.replace(/,/g, '') : String(value);
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Parse a comma-formatted string to number (e.g., "1,000,000" → 1000000)
export function parseCommaNumber(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0;
}

// Handle input change - only allow digits and commas, auto-format
export function handleCurrencyInput(rawValue: string): string {
  // Remove everything except digits
  const digitsOnly = rawValue.replace(/[^\d]/g, '');
  if (digitsOnly === '') return '';
  // Format with commas
  return formatWithCommas(digitsOnly);
}
