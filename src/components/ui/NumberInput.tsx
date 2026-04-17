import { forwardRef, type InputHTMLAttributes, type ChangeEvent } from 'react';
import { Input } from './Input';

interface NumberInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'size' | 'type' | 'value' | 'onChange'
  > {
  label?: string;
  hint?: string;
  error?: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  allowNegative?: boolean;
  min?: number;
  max?: number;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ value, onValueChange, allowNegative = false, min, max, ...rest }, ref) {
    const toDisplay = (v: number | null): string =>
      v === null || Number.isNaN(v) ? '' : String(v);

    const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
      const raw = e.target.value.replace(/[^0-9\-.]/g, '');
      if (raw === '' || raw === '-') {
        onValueChange(null);
        return;
      }
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return;
      if (!allowNegative && parsed < 0) return;
      if (min !== undefined && parsed < min) return;
      if (max !== undefined && parsed > max) return;
      onValueChange(parsed);
    };

    return (
      <Input
        ref={ref}
        inputMode="decimal"
        value={toDisplay(value)}
        onChange={handleChange}
        {...rest}
      />
    );
  },
);
