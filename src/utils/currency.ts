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
