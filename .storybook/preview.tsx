import type { Preview, Decorator } from '@storybook/react-vite';
import '../src/index.css';

// Theme is driven by a `data-theme` attribute on <html>; the default @theme block is the
// dark palette. A toolbar toggle lets stories be reviewed in both themes.
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string | undefined) ?? 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  return (
    <div
      style={{
        background: 'var(--color-surface-base)',
        color: 'var(--color-content-primary)',
        minHeight: '100vh',
        padding: '1.5rem',
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: 'Color theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: [
          { value: 'dark', title: 'Dark', icon: 'moon' },
          { value: 'light', title: 'Light', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
