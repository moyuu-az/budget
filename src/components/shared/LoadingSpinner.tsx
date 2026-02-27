interface Props {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

function LoadingSpinner({ size = 'md' }: Props) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} animate-spin rounded-full border-2 border-blue-400 border-t-transparent`}
    />
  );
}

export default LoadingSpinner;
