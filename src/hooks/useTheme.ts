import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

export const useThemeEffect = (): void => {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
};
