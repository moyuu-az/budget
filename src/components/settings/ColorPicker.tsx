interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

function ColorPicker({ value, onChange, className }: Props) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  );
}

export default ColorPicker;
