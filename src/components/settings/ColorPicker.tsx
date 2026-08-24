interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Lets a caller tie a <label htmlFor> to the input it actually wraps. */
  id?: string;
  /** For the callers that have no visible label of their own. */
  'aria-label'?: string;
}

function ColorPicker({ value, onChange, className, id, 'aria-label': ariaLabel }: Props) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export default ColorPicker;
