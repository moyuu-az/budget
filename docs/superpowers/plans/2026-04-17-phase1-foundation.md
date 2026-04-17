# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リファクタリングの基盤（デザイントークン / 共通UIプリミティブ / UIStore / 肥大化コンポーネント分割 / IPC Zodバリデーション / a11y 基盤）を構築する。Phase 1 完了時点で既存機能は全て動作し、見た目は概ね既存と同じだが内部構造が整理されている状態。

**Architecture:** Tailwind v4 `@theme` でトークンを一元管理し、`components/ui/` に業務ドメイン非依存のプリミティブを新設。`useUIStore` で `selectedYearMonth` と `theme` を集約。`lib/ipc.ts` で Zod パース付きラッパーに差し替え。

**Tech Stack:** React 19 / TypeScript strict / Tailwind CSS v4 / Zustand 5 + persist / Zod 3 / Framer Motion 12 / Electron 40 / electron-vite 5

**Spec Reference:** `docs/superpowers/specs/2026-04-17-full-refactor-design.md`

**Conventions:**
- 2 スペースインデント / シングルクォート / セミコロン必須
- `any` 禁止（`unknown` + type guard）
- 関数は明示的な戻り値型
- コンポーネント: PascalCase.tsx / hooks & utils: camelCase.ts（既存慣例に従う）
- コミットは Conventional Commits: `feat:` / `refactor:` / `chore:`

**Verification Strategy:**
Phase 1 では Vitest 未導入のため、各タスク完了時に以下を実施:
1. `npm run build` で TypeScript エラー 0 を確認
2. `npm run dev` で該当ビューを手動確認（破綻していないこと）
3. 視覚的スクリーンショット確認は Phase 2 完了後にまとめて実施

---

## Task 1: 依存追加（zod）

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install zod**

```bash
npm install zod@^3.23.8
```

- [ ] **Step 2: Verify install**

```bash
npm ls zod
```
Expected: `zod@3.23.x` listed under dependencies.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod for IPC validation"
```

---

## Task 2: デザイントークン定義

**Files:**
- Create: `src/theme/tokens.ts`

- [ ] **Step 1: Create tokens file**

```ts
// src/theme/tokens.ts
export const lightColors = {
  'surface-base': '#F8FAFC',
  'surface-raised': '#FFFFFF',
  'surface-overlay': 'rgba(255, 255, 255, 0.95)',
  'surface-inverse': '#0F172A',
  'content-primary': '#0F172A',
  'content-secondary': '#334155',
  'content-muted': '#64748B',
  'content-disabled': '#CBD5E1',
  'content-inverse': '#F8FAFC',
  'accent-primary': '#4F46E5',
  'accent-secondary': '#7C3AED',
  'semantic-success': '#16A34A',
  'semantic-warning': '#D97706',
  'semantic-danger': '#DC2626',
  'semantic-info': '#0284C7',
  'chart-income': '#16A34A',
  'chart-expense': '#DC2626',
  'chart-balance': '#4F46E5',
  'chart-forecast': '#7C3AED',
  'border-subtle': 'rgba(15, 23, 42, 0.08)',
  'border-strong': 'rgba(15, 23, 42, 0.16)',
  'border-focus': '#4F46E5',
} as const;

export const darkColors = {
  'surface-base': '#141A2E',
  'surface-raised': 'rgba(30, 41, 72, 0.6)',
  'surface-overlay': 'rgba(30, 41, 72, 0.8)',
  'surface-inverse': '#F8FAFC',
  'content-primary': '#E2E8F0',
  'content-secondary': '#CBD5E1',
  'content-muted': '#94A3B8',
  'content-disabled': '#475569',
  'content-inverse': '#0F172A',
  'accent-primary': '#818CF8',
  'accent-secondary': '#A78BFA',
  'semantic-success': '#22C55E',
  'semantic-warning': '#F59E0B',
  'semantic-danger': '#EF4444',
  'semantic-info': '#38BDF8',
  'chart-income': '#22C55E',
  'chart-expense': '#EF4444',
  'chart-balance': '#60A5FA',
  'chart-forecast': '#A78BFA',
  'border-subtle': 'rgba(100, 116, 170, 0.15)',
  'border-strong': 'rgba(100, 116, 170, 0.3)',
  'border-focus': '#818CF8',
} as const;

export const chartSeries = [
  '#4F46E5', '#22C55E', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#8B5CF6', '#14B8A6',
] as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  pill: '999px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.08)',
  md: '0 4px 12px rgba(15, 23, 42, 0.10)',
  lg: '0 12px 32px rgba(15, 23, 42, 0.14)',
  'glow-blue': '0 0 20px rgba(79, 70, 229, 0.15), 0 0 40px rgba(79, 70, 229, 0.05)',
  'glow-green': '0 0 20px rgba(34, 197, 94, 0.15), 0 0 40px rgba(34, 197, 94, 0.05)',
  'glow-red': '0 0 20px rgba(239, 68, 68, 0.15), 0 0 40px rgba(239, 68, 68, 0.05)',
  'glow-purple': '0 0 20px rgba(139, 92, 246, 0.15), 0 0 40px rgba(139, 92, 246, 0.05)',
} as const;

export const motionDurations = {
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
} as const;

export const motionEasings = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
} as const;

export type ThemeColors = typeof lightColors;
export type ThemeName = 'light' | 'dark';
```

- [ ] **Step 2: Verify no import errors**

```bash
npx tsc --noEmit -p tsconfig.web.json
```
Expected: no errors related to tokens.ts.

- [ ] **Step 3: Commit**

```bash
git add src/theme/tokens.ts
git commit -m "feat: add design tokens (light/dark palettes, radii, shadows, motion)"
```

---

## Task 3: Tailwind v4 `@theme` 設定

**Files:**
- Create: `src/theme/theme.css`
- Modify: `src/index.css`

- [ ] **Step 1: Create theme.css with @theme block**

```css
/* src/theme/theme.css */
@theme {
  --color-surface-base: #141A2E;
  --color-surface-raised: rgba(30, 41, 72, 0.6);
  --color-surface-overlay: rgba(30, 41, 72, 0.8);
  --color-surface-inverse: #F8FAFC;
  --color-content-primary: #E2E8F0;
  --color-content-secondary: #CBD5E1;
  --color-content-muted: #94A3B8;
  --color-content-disabled: #475569;
  --color-content-inverse: #0F172A;
  --color-accent-primary: #818CF8;
  --color-accent-secondary: #A78BFA;
  --color-semantic-success: #22C55E;
  --color-semantic-warning: #F59E0B;
  --color-semantic-danger: #EF4444;
  --color-semantic-info: #38BDF8;
  --color-chart-income: #22C55E;
  --color-chart-expense: #EF4444;
  --color-chart-balance: #60A5FA;
  --color-chart-forecast: #A78BFA;
  --color-border-subtle: rgba(100, 116, 170, 0.15);
  --color-border-strong: rgba(100, 116, 170, 0.3);
  --color-border-focus: #818CF8;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-pill: 999px;

  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.10);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.14);

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
  --ease-decelerate: cubic-bezier(0, 0, 0, 1);
}

[data-theme='light'] {
  --color-surface-base: #F8FAFC;
  --color-surface-raised: #FFFFFF;
  --color-surface-overlay: rgba(255, 255, 255, 0.95);
  --color-surface-inverse: #0F172A;
  --color-content-primary: #0F172A;
  --color-content-secondary: #334155;
  --color-content-muted: #64748B;
  --color-content-disabled: #CBD5E1;
  --color-content-inverse: #F8FAFC;
  --color-accent-primary: #4F46E5;
  --color-accent-secondary: #7C3AED;
  --color-semantic-success: #16A34A;
  --color-semantic-warning: #D97706;
  --color-semantic-danger: #DC2626;
  --color-semantic-info: #0284C7;
  --color-chart-income: #16A34A;
  --color-chart-expense: #DC2626;
  --color-chart-balance: #4F46E5;
  --color-chart-forecast: #7C3AED;
  --color-border-subtle: rgba(15, 23, 42, 0.08);
  --color-border-strong: rgba(15, 23, 42, 0.16);
  --color-border-focus: #4F46E5;
}

@custom-variant dark (&:where([data-theme='dark'] *), &:where([data-theme='dark']));
```

- [ ] **Step 2: Update index.css to import theme.css and remove legacy vars**

Replace `src/index.css` lines 1-14 (the `@import 'tailwindcss';` + `:root {...}` block) with:

```css
@import 'tailwindcss';
@import './theme/theme.css';

html,
body {
  background-color: var(--color-surface-base);
  color: var(--color-content-primary);
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

#root {
  height: 100vh;
}
```

Keep lines 29+ (`.glass`, `.glow-*`, scrollbar, etc.) but update them to reference new token names:

- `.glass` background → `var(--color-surface-raised)`, border → `var(--color-border-subtle)`
- `.glass-strong` background → `var(--color-surface-overlay)`, border → `var(--color-border-subtle)`
- Keep `.glow-*` classes as-is (they reference removed vars — update to inline rgba OR add back glow CSS vars); the simpler path: replace each `var(--glow-blue)` with `rgba(79, 70, 229, 0.15)` etc.

- [ ] **Step 3: Verify dev server renders without CSS errors**

```bash
npm run dev
```
Expected: app window opens, styling approximately matches previous dark look. Close after confirming.

- [ ] **Step 4: Commit**

```bash
git add src/theme/theme.css src/index.css
git commit -m "feat: wire design tokens into Tailwind v4 @theme with dark/light vars"
```

---

## Task 4: Motion variants モジュール

**Files:**
- Create: `src/theme/motion.ts`

- [ ] **Step 1: Create motion.ts**

```ts
// src/theme/motion.ts
import type { Variants, Transition } from 'framer-motion';

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const transition = (duration = 0.2, ease: Transition['ease'] = [0.2, 0, 0, 1]): Transition => {
  if (prefersReducedMotion()) return { duration: 0 };
  return { duration, ease };
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition(0.24) },
  exit: { opacity: 0, y: -8, transition: transition(0.18) },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition(0.2) },
  exit: { opacity: 0, transition: transition(0.15) },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: transition(0.2) },
  exit: { opacity: 0, scale: 0.98, transition: transition(0.15) },
};

export const stagger = (delayChildren = 0, staggerChildren = 0.04): Variants => ({
  animate: {
    transition: { delayChildren, staggerChildren: prefersReducedMotion() ? 0 : staggerChildren },
  },
});

export const cardHover = {
  whileHover: prefersReducedMotion() ? {} : { y: -2, transition: transition(0.15) },
  whileTap: prefersReducedMotion() ? {} : { scale: 0.99, transition: transition(0.1) },
} as const;
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit -p tsconfig.web.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/theme/motion.ts
git commit -m "feat: add shared motion variants with reduced-motion support"
```

---

## Task 5: cn ユーティリティ

**Files:**
- Create: `src/lib/cn.ts`

- [ ] **Step 1: Create cn.ts (className merger)**

```ts
// src/lib/cn.ts
type ClassValue = string | number | false | null | undefined | ClassValue[];

export const cn = (...inputs: ClassValue[]): string => {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) classes.push(nested);
    }
  }
  return classes.join(' ');
};
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/cn.ts
git commit -m "feat: add cn className merger utility"
```

---

## Task 6: Button + IconButton プリミティブ

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/IconButton.tsx`

- [ ] **Step 1: Create Button**

```tsx
// src/components/ui/Button.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-primary text-content-inverse hover:opacity-90 active:opacity-80 ' +
    'shadow-[var(--shadow-md)]',
  secondary:
    'bg-surface-raised text-content-primary border border-border-subtle ' +
    'hover:border-border-strong',
  ghost: 'bg-transparent text-content-primary hover:bg-surface-raised',
  danger: 'bg-semantic-danger text-white hover:opacity-90 active:opacity-80',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-md)]',
        'font-medium select-none',
        'transition-[background-color,opacity,border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
```

- [ ] **Step 2: Create IconButton**

```tsx
// src/components/ui/IconButton.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'danger';
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
} as const;

const toneClasses = {
  default: 'text-content-secondary hover:text-content-primary hover:bg-surface-raised',
  danger: 'text-semantic-danger hover:bg-semantic-danger/10',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-md)]',
        'transition-colors duration-[var(--duration-fast)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit -p tsconfig.web.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/IconButton.tsx
git commit -m "feat(ui): add Button and IconButton primitives"
```

---

## Task 7: Card プリミティブ

**Files:**
- Create: `src/components/ui/Card.tsx`

- [ ] **Step 1: Create Card**

```tsx
// src/components/ui/Card.tsx
import { forwardRef, type HTMLAttributes, type ElementType } from 'react';
import { cn } from '../../lib/cn';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  padding?: CardPadding;
  interactive?: boolean;
  glow?: 'blue' | 'green' | 'red' | 'purple' | 'none';
}

const paddingClasses: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const glowClasses = {
  blue: 'shadow-[0_0_20px_rgba(79,70,229,0.15),0_0_40px_rgba(79,70,229,0.05)]',
  green: 'shadow-[0_0_20px_rgba(34,197,94,0.15),0_0_40px_rgba(34,197,94,0.05)]',
  red: 'shadow-[0_0_20px_rgba(239,68,68,0.15),0_0_40px_rgba(239,68,68,0.05)]',
  purple: 'shadow-[0_0_20px_rgba(139,92,246,0.15),0_0_40px_rgba(139,92,246,0.05)]',
  none: '',
} as const;

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Component = 'div', padding = 'md', interactive = false, glow = 'none', className, children, ...rest },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        'rounded-[var(--radius-lg)] border border-border-subtle',
        'bg-surface-raised backdrop-blur-[12px]',
        'transition-[transform,box-shadow,border-color] duration-[var(--duration-base)]',
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
        paddingClasses[padding],
        glowClasses[glow],
        className,
      )}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      {...rest}
    >
      {children}
    </Component>
  );
});
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Card.tsx
git commit -m "feat(ui): add Card primitive with interactive and glow variants"
```

---

## Task 8: Input + NumberInput プリミティブ

**Files:**
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/NumberInput.tsx`

- [ ] **Step 1: Create Input**

```tsx
// src/components/ui/Input.tsx
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, prefix, suffix, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-content-secondary">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-md)] border bg-surface-raised',
          'px-3 h-10 transition-colors duration-[var(--duration-fast)]',
          'focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus/30',
          error ? 'border-semantic-danger' : 'border-border-subtle',
        )}
      >
        {prefix && <span className="text-content-muted shrink-0">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex-1 bg-transparent text-content-primary placeholder:text-content-muted',
            'focus:outline-none text-sm',
            className,
          )}
          {...rest}
        />
        {suffix && <span className="text-content-muted shrink-0">{suffix}</span>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-semantic-danger">
          {error}
        </p>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Create NumberInput**

```tsx
// src/components/ui/NumberInput.tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './Input';

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'value' | 'onChange'> {
  label?: string;
  hint?: string;
  error?: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  allowNegative?: boolean;
  min?: number;
  max?: number;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, allowNegative = false, min, max, ...rest },
  ref,
) {
  const toDisplay = (v: number | null): string => (v === null || Number.isNaN(v) ? '' : String(v));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
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
});
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Input.tsx src/components/ui/NumberInput.tsx
git commit -m "feat(ui): add Input and NumberInput primitives with a11y wiring"
```

---

## Task 9: Select プリミティブ

**Files:**
- Create: `src/components/ui/Select.tsx`

- [ ] **Step 1: Create Select (native select, styled)**

```tsx
// src/components/ui/Select.tsx
import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-content-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'appearance-none w-full h-10 px-3 pr-9 rounded-[var(--radius-md)]',
            'bg-surface-raised text-content-primary border',
            'focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30',
            'transition-colors text-sm',
            error ? 'border-semantic-danger' : 'border-border-subtle',
            className,
          )}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-content-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-semantic-danger">
          {error}
        </p>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Verify & Commit**

```bash
npx tsc --noEmit -p tsconfig.web.json
git add src/components/ui/Select.tsx
git commit -m "feat(ui): add Select primitive with native a11y"
```

---

## Task 10: Tabs プリミティブ

**Files:**
- Create: `src/components/ui/Tabs.tsx`

- [ ] **Step 1: Create Tabs (controlled, keyboard nav)**

```tsx
// src/components/ui/Tabs.tsx
import { useRef, type ReactNode, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className,
}: TabsProps<T>): React.ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const enabled = items.map((it, i) => ({ it, i })).filter((x) => !x.it.disabled);
    const currentPos = enabled.findIndex((x) => x.i === index);
    const nextPos = (currentPos + delta + enabled.length) % enabled.length;
    const next = enabled[nextPos];
    onChange(next.it.value);
    const nextBtn = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-index="${next.i}"]`);
    nextBtn?.focus();
  };

  const height = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-[var(--radius-md)]',
        'bg-surface-raised border border-border-subtle',
        className,
      )}
    >
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={it.disabled || undefined}
            tabIndex={active ? 0 : -1}
            data-tab-index={i}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => handleKey(e, i)}
            className={cn(
              'px-3 rounded-[var(--radius-sm)] font-medium',
              'transition-colors duration-[var(--duration-fast)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              height,
              active
                ? 'bg-accent-primary text-content-inverse'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface-overlay',
              it.disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify & Commit**

```bash
npx tsc --noEmit -p tsconfig.web.json
git add src/components/ui/Tabs.tsx
git commit -m "feat(ui): add Tabs primitive with keyboard navigation"
```

---

## Task 11: Dialog + ConfirmDialog プリミティブ

**Files:**
- Create: `src/components/ui/Dialog.tsx`
- Create: `src/components/ui/ConfirmDialog.tsx`
- Modify: existing `src/components/shared/ConfirmDialog.tsx` usages (tracked in Task 20)

- [ ] **Step 1: Create Dialog**

```tsx
// src/components/ui/Dialog.tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { fadeIn, scaleIn } from '../../theme/motion';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnOverlayClick?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
}: DialogProps): React.ReactElement | null {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handle);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handle);
      prev?.focus();
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={fadeIn}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeOnOverlayClick ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            variants={scaleIn}
            className={cn(
              'relative w-full rounded-[var(--radius-xl)] border border-border-subtle',
              'bg-surface-overlay backdrop-blur-xl shadow-[var(--shadow-lg)]',
              'p-6 focus:outline-none',
              sizeClasses[size],
            )}
          >
            <div className="mb-4">
              <h2 id={titleId} className="text-lg font-semibold text-content-primary">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-content-muted">
                  {description}
                </p>
              )}
            </div>
            <div>{children}</div>
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Create ConfirmDialog**

```tsx
// src/components/ui/ConfirmDialog.tsx
import { Dialog } from './Dialog';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '確定',
  cancelLabel = 'キャンセル',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">{description}</span>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify & Commit**

```bash
npx tsc --noEmit -p tsconfig.web.json
git add src/components/ui/Dialog.tsx src/components/ui/ConfirmDialog.tsx
git commit -m "feat(ui): add Dialog and ConfirmDialog with focus trap"
```

---

## Task 12: Badge + Tooltip + Skeleton + EmptyState

**Files:**
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/Tooltip.tsx`
- Create: `src/components/ui/Skeleton.tsx`
- Create: `src/components/ui/EmptyState.tsx`

- [ ] **Step 1: Badge**

```tsx
// src/components/ui/Badge.tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-raised text-content-secondary border-border-subtle',
  success: 'bg-semantic-success/15 text-semantic-success border-semantic-success/30',
  warning: 'bg-semantic-warning/15 text-semantic-warning border-semantic-warning/30',
  danger: 'bg-semantic-danger/15 text-semantic-danger border-semantic-danger/30',
  info: 'bg-semantic-info/15 text-semantic-info border-semantic-info/30',
  accent: 'bg-accent-primary/15 text-accent-primary border-accent-primary/30',
};

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 h-6 text-xs font-medium',
        'rounded-[var(--radius-pill)] border',
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Tooltip (CSS-only hover/focus)**

```tsx
// src/components/ui/Tooltip.tsx
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps): React.ReactElement {
  const id = useId();
  return (
    <span className="relative inline-flex group" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-30',
          side === 'top' ? '-top-1 -translate-y-full' : '-bottom-1 translate-y-full',
          'whitespace-nowrap px-2 py-1 text-xs rounded-[var(--radius-sm)]',
          'bg-content-primary text-surface-base shadow-[var(--shadow-md)]',
          'opacity-0 scale-95 transition-[opacity,transform] duration-[var(--duration-fast)]',
          'group-hover:opacity-100 group-hover:scale-100',
          'group-focus-within:opacity-100 group-focus-within:scale-100',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
```

- [ ] **Step 3: Skeleton**

```tsx
// src/components/ui/Skeleton.tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps): React.ReactElement {
  const shape = variant === 'circle' ? 'rounded-full' : variant === 'text' ? 'rounded-[var(--radius-sm)] h-3' : 'rounded-[var(--radius-md)]';
  return (
    <div
      aria-hidden="true"
      style={{ width, height, ...style }}
      className={cn(
        'animate-pulse bg-surface-raised/80 border border-border-subtle',
        shape,
        className,
      )}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: EmptyState**

```tsx
// src/components/ui/EmptyState.tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-12 px-6 gap-3',
        className,
      )}
    >
      {icon && <div className="text-content-muted h-10 w-10 flex items-center justify-center">{icon}</div>}
      <h3 className="text-base font-semibold text-content-primary">{title}</h3>
      {description && <p className="text-sm text-content-muted max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Verify & Commit**

```bash
npx tsc --noEmit -p tsconfig.web.json
git add src/components/ui/Badge.tsx src/components/ui/Tooltip.tsx src/components/ui/Skeleton.tsx src/components/ui/EmptyState.tsx
git commit -m "feat(ui): add Badge, Tooltip, Skeleton, EmptyState primitives"
```

---

## Task 13: Toast を ui/ に昇格

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Delete (later): `src/components/shared/Toast.tsx` (after migration)

- [ ] **Step 1: Read existing Toast for behavior parity**

```bash
```
Read `src/components/shared/Toast.tsx` fully. Note the store key used (`useToastStore`).

- [ ] **Step 2: Create ui/Toast.tsx (same store, refined a11y/styling)**

```tsx
// src/components/ui/Toast.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore } from '../../stores/useToastStore';
import { cn } from '../../lib/cn';

const toneClasses = {
  success: 'border-semantic-success/40 bg-surface-overlay',
  error: 'border-semantic-danger/40 bg-surface-overlay',
  info: 'border-accent-primary/40 bg-surface-overlay',
} as const;

const iconFor = (type: 'success' | 'error' | 'info'): string => {
  if (type === 'success') return '✓';
  if (type === 'error') return '!';
  return 'i';
};

export function Toast(): React.ReactElement {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.removeToast);

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed bottom-6 right-6 z-40 flex flex-col gap-2 max-w-sm"
    >
      <AnimatePresence initial={false}>
        {toasts.slice(0, 3).map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className={cn(
              'flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3',
              'backdrop-blur-xl shadow-[var(--shadow-md)]',
              toneClasses[t.type],
            )}
          >
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                t.type === 'success' && 'bg-semantic-success/20 text-semantic-success',
                t.type === 'error' && 'bg-semantic-danger/20 text-semantic-danger',
                t.type === 'info' && 'bg-accent-primary/20 text-accent-primary',
              )}
              aria-hidden="true"
            >
              {iconFor(t.type)}
            </span>
            <p className="flex-1 text-sm text-content-primary">{t.message}</p>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="通知を閉じる"
              className="text-content-muted hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx import**

Replace `import Toast from './components/shared/Toast';` with:
```tsx
import { Toast } from './components/ui/Toast';
```

Replace `<Toast />` (already present) — no JSX change needed.

- [ ] **Step 4: Delete old Toast file**

```bash
rm src/components/shared/Toast.tsx
```

- [ ] **Step 5: Build and verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run build
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui): migrate Toast to ui/ with improved a11y"
```

---

## Task 14: useUIStore 新設

**Files:**
- Create: `src/stores/useUIStore.ts`
- Create: `src/types/ui.ts`

- [ ] **Step 1: Create types/ui.ts**

```ts
// src/types/ui.ts
export type Theme = 'light' | 'dark';

export const toYearMonth = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const shiftYearMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return toYearMonth(date);
};
```

- [ ] **Step 2: Create useUIStore.ts**

```ts
// src/stores/useUIStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '../types/ui';
import { toYearMonth, shiftYearMonth } from '../types/ui';

interface UIState {
  theme: Theme;
  selectedYearMonth: string;
  sidebarCollapsed: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSelectedYearMonth: (ym: string) => void;
  shiftMonth: (delta: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const systemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: systemTheme(),
      selectedYearMonth: toYearMonth(new Date()),
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSelectedYearMonth: (selectedYearMonth) => set({ selectedYearMonth }),
      shiftMonth: (delta) => set((s) => ({ selectedYearMonth: shiftYearMonth(s.selectedYearMonth, delta) })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: 'balance-forecast-ui',
      partialize: (state) => ({ theme: state.theme, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
```

- [ ] **Step 3: Apply data-theme attribute on theme change**

Create `src/hooks/useTheme.ts`:

```ts
// src/hooks/useTheme.ts
import { useEffect } from 'react';
import { useUIStore } from '../stores/useUIStore';

export const useThemeEffect = (): void => {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
};
```

- [ ] **Step 4: Wire in App.tsx**

In `src/App.tsx`, add at the top of the `App` function body:

```tsx
import { useThemeEffect } from './hooks/useTheme';
// ... inside function App():
useThemeEffect();
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Expected: app launches; `<html data-theme="dark">` attribute visible in DevTools.

- [ ] **Step 6: Commit**

```bash
git add src/stores/useUIStore.ts src/types/ui.ts src/hooks/useTheme.ts src/App.tsx
git commit -m "feat: add useUIStore (theme + selectedYearMonth + sidebar) with persist"
```

---

## Task 15: selectedYearMonth を UIStore に移行

**Files:**
- Modify: `src/components/dashboard/SankeyChart.tsx` (uses local month state)
- Modify: `src/components/entries/EntriesView.tsx` (uses local month state)
- Modify: `src/components/analytics/AnalyticsView.tsx`

- [ ] **Step 1: Identify existing `selectedYearMonth` useState usages**

```bash
```
Run a Grep for `selectedYearMonth` and local `useState` in the components. Record each file and line.

- [ ] **Step 2: Replace in SankeyChart**

In `src/components/dashboard/SankeyChart.tsx`, find the `const [selectedYearMonth, setSelectedYearMonth] = useState(...)` line and replace with:

```tsx
import { useUIStore } from '../../stores/useUIStore';
// remove the useState import if only used for this

const selectedYearMonth = useUIStore((s) => s.selectedYearMonth);
const setSelectedYearMonth = useUIStore((s) => s.setSelectedYearMonth);
const shiftMonth = useUIStore((s) => s.shiftMonth);
```

Replace existing month-increment handlers to use `shiftMonth(-1)` / `shiftMonth(1)`.

- [ ] **Step 3: Repeat in EntriesView.tsx**

Same replacement pattern.

- [ ] **Step 4: Repeat in AnalyticsView.tsx**

Same pattern where applicable.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Navigate Dashboard → Sankey, Entries, Analytics. Confirm selected month persists across views.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/SankeyChart.tsx src/components/entries/EntriesView.tsx src/components/analytics/AnalyticsView.tsx
git commit -m "refactor: hoist selectedYearMonth into useUIStore"
```

---

## Task 16: useCashFlowData hook を抽出

**Files:**
- Create: `src/hooks/useCashFlowData.ts`
- Modify: `src/components/dashboard/SankeyChart.tsx`

- [ ] **Step 1: Read existing `buildCashFlowData` usage**

```bash
```
Check `src/utils/cashflow.ts` exports and how `SankeyChart.tsx` calls it.

- [ ] **Step 2: Create hook**

```ts
// src/hooks/useCashFlowData.ts
import { useMemo } from 'react';
import { useTemplateStore } from '../stores/useTemplateStore';
import { useCategoryStore } from '../stores/useCategoryStore';
import { useMonthlyStore } from '../stores/useMonthlyStore';
import { buildCashFlowData, type CashFlowData } from '../utils/cashflow';

export const useCashFlowData = (yearMonth: string): CashFlowData => {
  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);
  const monthlyAmountsMap = useMonthlyStore((s) => s.monthlyAmountsMap);

  return useMemo(
    () => buildCashFlowData({ yearMonth, templates, categories, monthlyAmountsMap }),
    [yearMonth, templates, categories, monthlyAmountsMap],
  );
};
```

Adjust the argument shape if `buildCashFlowData` signature differs. If `CashFlowData` is not exported from `utils/cashflow.ts`, add `export` to its definition.

- [ ] **Step 3: Update SankeyChart to use the hook**

In `src/components/dashboard/SankeyChart.tsx`, remove local `useMemo(() => buildCashFlowData(...))` and replace with:

```tsx
import { useCashFlowData } from '../../hooks/useCashFlowData';
// ...
const cashFlowData = useCashFlowData(selectedYearMonth);
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Dashboard Sankey should render identically.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCashFlowData.ts src/components/dashboard/SankeyChart.tsx src/utils/cashflow.ts
git commit -m "refactor: extract useCashFlowData hook from SankeyChart"
```

---

## Task 17: SankeyChart を 3 ファイルに分割

**Files:**
- Create: `src/components/dashboard/SankeyChart/index.tsx`
- Create: `src/components/dashboard/SankeyChart/SankeyCanvas.tsx`
- Create: `src/components/dashboard/SankeyChart/SankeyTooltip.tsx`
- Delete: `src/components/dashboard/SankeyChart.tsx`

- [ ] **Step 1: Read current SankeyChart.tsx thoroughly**

```bash
```
Load full content into memory. Identify: (a) outer orchestrator (month navigation, container), (b) SVG/D3 render logic, (c) tooltip render.

- [ ] **Step 2: Create SankeyTooltip**

```tsx
// src/components/dashboard/SankeyChart/SankeyTooltip.tsx
interface TooltipData {
  label: string;
  value: number;
  x: number;
  y: number;
}

interface SankeyTooltipProps {
  data: TooltipData | null;
}

export function SankeyTooltip({ data }: SankeyTooltipProps): React.ReactElement | null {
  if (!data) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 rounded-[var(--radius-md)] border border-border-subtle bg-surface-overlay backdrop-blur-md px-3 py-2 text-xs shadow-[var(--shadow-md)]"
      style={{ left: data.x + 8, top: data.y - 4 }}
    >
      <div className="font-medium text-content-primary">{data.label}</div>
      <div className="text-content-muted">¥ {data.value.toLocaleString()}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create SankeyCanvas**

Extract the D3 sankey rendering logic (ResizeObserver, `d3-sankey` call, node/link drawing) from the original component. Signature:

```tsx
// src/components/dashboard/SankeyChart/SankeyCanvas.tsx
import { useEffect, useRef, useState } from 'react';
import type { CashFlowData } from '../../../utils/cashflow';

interface TooltipData {
  label: string;
  value: number;
  x: number;
  y: number;
}

interface SankeyCanvasProps {
  data: CashFlowData;
  onHover: (tip: TooltipData | null) => void;
}

export function SankeyCanvas({ data, onHover }: SankeyCanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 360 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: Math.max(320, width), h: Math.max(240, height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Copy the D3 sankey generation logic here, producing `nodes` and `links` SVG paths.
  // Call onHover(...) on mouseenter/mousemove and onHover(null) on mouseleave.

  return (
    <div ref={containerRef} className="relative w-full h-[360px]">
      <svg width={size.w} height={size.h} role="img" aria-label="キャッシュフロー図">
        {/* render nodes and links using d3-sankey result */}
      </svg>
    </div>
  );
}
```

When porting the D3 logic from the original file, keep the structure but replace hard-coded colors with tokens where possible. Leave in-line colors where they are per-category from the data.

- [ ] **Step 4: Create index.tsx orchestrator**

```tsx
// src/components/dashboard/SankeyChart/index.tsx
import { useState } from 'react';
import { Card } from '../../ui/Card';
import { IconButton } from '../../ui/IconButton';
import { useUIStore } from '../../../stores/useUIStore';
import { useCashFlowData } from '../../../hooks/useCashFlowData';
import { SankeyCanvas } from './SankeyCanvas';
import { SankeyTooltip } from './SankeyTooltip';

export function SankeyChart(): React.ReactElement {
  const selectedYearMonth = useUIStore((s) => s.selectedYearMonth);
  const shiftMonth = useUIStore((s) => s.shiftMonth);
  const data = useCashFlowData(selectedYearMonth);
  const [tooltip, setTooltip] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  return (
    <Card padding="md" className="relative">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">キャッシュフロー</h3>
        <div className="flex items-center gap-1">
          <IconButton
            size="sm"
            label="前月"
            icon={<span>‹</span>}
            onClick={() => shiftMonth(-1)}
          />
          <span className="px-2 text-sm text-content-secondary tabular-nums">{selectedYearMonth}</span>
          <IconButton
            size="sm"
            label="翌月"
            icon={<span>›</span>}
            onClick={() => shiftMonth(1)}
          />
        </div>
      </header>
      <SankeyCanvas data={data} onHover={setTooltip} />
      <SankeyTooltip data={tooltip} />
    </Card>
  );
}
```

- [ ] **Step 5: Update import sites**

Find the single import of `SankeyChart` in `src/components/dashboard/DashboardView.tsx` and leave as-is — the directory index makes it still resolvable. Verify with:

```bash
```
Grep `SankeyChart` imports to confirm no path break.

- [ ] **Step 6: Delete old file**

```bash
rm src/components/dashboard/SankeyChart.tsx
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Open Dashboard → confirm Sankey still works (navigation, hover tooltip).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): split SankeyChart into orchestrator + canvas + tooltip"
```

---

## Task 18: CategoryManager を 3 ファイルに分割

**Files:**
- Create: `src/components/settings/CategoryList.tsx`
- Create: `src/components/settings/CategoryForm.tsx`
- Create: `src/components/settings/ColorPicker.tsx`
- Modify: `src/components/settings/CategoryManager.tsx` → becomes orchestrator (~80 行) or renamed

- [ ] **Step 1: Read existing CategoryManager fully**

Identify: (a) list rendering section, (b) form section (create + edit), (c) color selection UI.

- [ ] **Step 2: Create ColorPicker**

```tsx
// src/components/settings/ColorPicker.tsx
import { cn } from '../../lib/cn';
import { Input } from '../ui/Input';

const PRESETS = [
  '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
  '#F59E0B', '#EAB308', '#22C55E', '#14B8A6',
  '#0EA5E9', '#6366F1', '#A855F7', '#64748B',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm font-medium text-content-secondary">{label}</span>}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`色 ${c}`}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            style={{ backgroundColor: c }}
            className={cn(
              'h-7 w-7 rounded-full border-2 transition-transform',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
              value === c ? 'border-content-primary scale-110' : 'border-transparent hover:scale-105',
            )}
          />
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="カスタム色 (hex)"
        placeholder="#RRGGBB"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create CategoryForm**

```tsx
// src/components/settings/CategoryForm.tsx
import { useEffect, useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { ColorPicker } from './ColorPicker';
import type { Category, CategoryInput } from '../../types';

interface CategoryFormProps {
  initial?: Category | null;
  onSubmit: (input: CategoryInput) => Promise<void> | void;
  onCancel: () => void;
}

export function CategoryForm({ initial, onSubmit, onCancel }: CategoryFormProps): React.ReactElement {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<'income' | 'expense'>(initial?.type ?? 'expense');
  const [color, setColor] = useState(initial?.color ?? '#4F46E5');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setType(initial?.type ?? 'expense');
    setColor(initial?.color ?? '#4F46E5');
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), type, color });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label="カテゴリ名" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select
        label="種別"
        value={type}
        onChange={(e) => setType(e.target.value as 'income' | 'expense')}
        options={[
          { value: 'expense', label: '支出' },
          { value: 'income', label: '収入' },
        ]}
      />
      <ColorPicker label="色" value={color} onChange={setColor} />
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>キャンセル</Button>
        <Button type="submit" loading={submitting}>{initial ? '更新' : '追加'}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Create CategoryList**

```tsx
// src/components/settings/CategoryList.tsx
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/IconButton';
import type { Category } from '../../types';

interface CategoryListProps {
  categories: Category[];
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
  onAdd: () => void;
}

export function CategoryList({ categories, onEdit, onDelete, onAdd }: CategoryListProps): React.ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-primary">カテゴリ</h3>
        <Button size="sm" onClick={onAdd}>+ 追加</Button>
      </header>
      <ul className="flex flex-col gap-1.5">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 px-3 h-10 rounded-[var(--radius-md)] bg-surface-raised border border-border-subtle"
          >
            <span
              aria-hidden
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: c.color ?? '#64748B' }}
            />
            <span className="flex-1 text-sm text-content-primary truncate">{c.name}</span>
            <Badge tone={c.type === 'income' ? 'success' : 'danger'}>{c.type === 'income' ? '収入' : '支出'}</Badge>
            <IconButton size="sm" label={`${c.name} を編集`} icon={<span>✎</span>} onClick={() => onEdit(c)} />
            <IconButton size="sm" tone="danger" label={`${c.name} を削除`} icon={<span>🗑</span>} onClick={() => onDelete(c)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Refactor CategoryManager.tsx as orchestrator**

```tsx
// src/components/settings/CategoryManager.tsx
import { useState } from 'react';
import { useCategoryStore } from '../../stores/useCategoryStore';
import { useToastStore } from '../../stores/useToastStore';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CategoryList } from './CategoryList';
import { CategoryForm } from './CategoryForm';
import type { Category, CategoryInput } from '../../types';

export function CategoryManager(): React.ReactElement {
  const categories = useCategoryStore((s) => s.categories);
  const addCategory = useCategoryStore((s) => s.addCategory);
  const updateCategory = useCategoryStore((s) => s.updateCategory);
  const deleteCategory = useCategoryStore((s) => s.deleteCategory);
  const toast = useToastStore((s) => s.addToast);

  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const handleSubmit = async (input: CategoryInput): Promise<void> => {
    try {
      if (editing) {
        await updateCategory(editing.id, input);
        toast({ type: 'success', message: 'カテゴリを更新しました' });
      } else {
        await addCategory(input);
        toast({ type: 'success', message: 'カテゴリを追加しました' });
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (e) {
      toast({ type: 'error', message: '操作に失敗しました' });
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      toast({ type: 'success', message: 'カテゴリを削除しました' });
    } catch {
      toast({ type: 'error', message: '削除に失敗しました' });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <CategoryList
        categories={categories}
        onAdd={() => { setEditing(null); setDialogOpen(true); }}
        onEdit={(c) => { setEditing(c); setDialogOpen(true); }}
        onDelete={setDeleteTarget}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'カテゴリを編集' : 'カテゴリを追加'}
      >
        <CategoryForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => setDialogOpen(false)}
        />
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="カテゴリを削除"
        description={deleteTarget ? `${deleteTarget.name} を削除します。この操作は取り消せません。` : ''}
        destructive
        confirmLabel="削除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Open Settings → confirm add/edit/delete of category works via dialog.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(settings): split CategoryManager into List + Form + ColorPicker"
```

---

## Task 19: EntriesView を分割

**Files:**
- Create: `src/components/entries/CategoryGroupList.tsx`
- Create: `src/components/entries/TemplateActions.tsx`
- Create: `src/components/entries/MonthNavigator.tsx` (if not already present)
- Modify: `src/components/entries/EntriesView.tsx`

- [ ] **Step 1: Read existing EntriesView.tsx**

Identify: (a) month navigator, (b) category group iteration, (c) bulk action buttons (copy/reset), (d) modal triggers.

- [ ] **Step 2: Create MonthNavigator**

```tsx
// src/components/entries/MonthNavigator.tsx
import { IconButton } from '../ui/IconButton';
import { useUIStore } from '../../stores/useUIStore';

export function MonthNavigator(): React.ReactElement {
  const ym = useUIStore((s) => s.selectedYearMonth);
  const shift = useUIStore((s) => s.shiftMonth);
  return (
    <div className="flex items-center gap-2" role="group" aria-label="月の選択">
      <IconButton size="md" label="前月" icon={<span>‹</span>} onClick={() => shift(-1)} />
      <div className="min-w-[7rem] text-center text-base font-semibold tabular-nums text-content-primary">{ym}</div>
      <IconButton size="md" label="翌月" icon={<span>›</span>} onClick={() => shift(1)} />
    </div>
  );
}
```

- [ ] **Step 3: Create TemplateActions**

```tsx
// src/components/entries/TemplateActions.tsx
import { Button } from '../ui/Button';
import { useUIStore } from '../../stores/useUIStore';
import { useMonthlyStore } from '../../stores/useMonthlyStore';
import { useToastStore } from '../../stores/useToastStore';
import { shiftYearMonth } from '../../types/ui';

interface TemplateActionsProps {
  onAddTemplate: () => void;
}

export function TemplateActions({ onAddTemplate }: TemplateActionsProps): React.ReactElement {
  const ym = useUIStore((s) => s.selectedYearMonth);
  const copyMonthlyAmounts = useMonthlyStore((s) => s.copyMonthlyAmounts);
  const toast = useToastStore((s) => s.addToast);

  const handleCopyPrev = async (): Promise<void> => {
    const prev = shiftYearMonth(ym, -1);
    try {
      await copyMonthlyAmounts(prev, ym);
      toast({ type: 'success', message: `${prev} の金額を ${ym} にコピーしました` });
    } catch {
      toast({ type: 'error', message: 'コピーに失敗しました' });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleCopyPrev}>先月をコピー</Button>
      <Button size="sm" onClick={onAddTemplate}>+ テンプレート追加</Button>
    </div>
  );
}
```

- [ ] **Step 4: Create CategoryGroupList**

```tsx
// src/components/entries/CategoryGroupList.tsx
import { useMemo } from 'react';
import { useTemplateStore } from '../../stores/useTemplateStore';
import { useCategoryStore } from '../../stores/useCategoryStore';
import CategoryGroup from './CategoryGroup';
import type { Category, EntryTemplate } from '../../types';

interface GroupedEntry {
  category: Category | null;
  templates: EntryTemplate[];
}

export function CategoryGroupList(): React.ReactElement {
  const templates = useTemplateStore((s) => s.templates);
  const categories = useCategoryStore((s) => s.categories);

  const groups = useMemo<GroupedEntry[]>(() => {
    const byCategory = new Map<number | null, EntryTemplate[]>();
    for (const t of templates) {
      const key = t.categoryId;
      const arr = byCategory.get(key) ?? [];
      arr.push(t);
      byCategory.set(key, arr);
    }
    const ordered: GroupedEntry[] = [];
    for (const c of categories) {
      const ts = byCategory.get(c.id);
      if (ts && ts.length) ordered.push({ category: c, templates: ts });
    }
    const none = byCategory.get(null);
    if (none && none.length) ordered.push({ category: null, templates: none });
    return ordered;
  }, [templates, categories]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <CategoryGroup key={g.category?.id ?? 'uncategorized'} category={g.category} templates={g.templates} />
      ))}
    </div>
  );
}
```

Note: keep `CategoryGroup` existing API. If its props differ, adjust here to match. Import path `./CategoryGroup` assumes the existing file remains at `src/components/entries/CategoryGroup.tsx`.

- [ ] **Step 5: Refactor EntriesView to thin orchestrator**

```tsx
// src/components/entries/EntriesView.tsx
import { useState } from 'react';
import { Card } from '../ui/Card';
import { MonthNavigator } from './MonthNavigator';
import { TemplateActions } from './TemplateActions';
import { CategoryGroupList } from './CategoryGroupList';
import TemplateEditor from './TemplateEditor';

export default function EntriesView(): React.ReactElement {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="sm" className="flex items-center justify-between gap-4 flex-wrap">
        <MonthNavigator />
        <TemplateActions onAddTemplate={() => setEditorOpen(true)} />
      </Card>
      <CategoryGroupList />
      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
```

If `TemplateEditor`'s existing props differ from `{ open, onClose }`, adapt the call-site; keep its internal signature unchanged in Phase 1.

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Open Entries view → add a template, navigate months, copy previous.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(entries): split EntriesView into MonthNavigator + CategoryGroupList + TemplateActions"
```

---

## Task 20: Zod スキーマ（main 側）

**Files:**
- Create: `electron/schemas.ts`

- [ ] **Step 1: Create main-side schemas**

```ts
// electron/schemas.ts
import { z } from 'zod';

export const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'yyyy-MM 形式である必要があります');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-MM-dd 形式である必要があります');
export const idSchema = z.number().int().nonnegative();
export const finiteNumber = z.number().finite();

export const typeEnum = z.enum(['income', 'expense']);

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(60),
  type: typeEnum,
  color: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const categoryPatchSchema = categoryInputSchema.partial();

export const templateInputSchema = z.object({
  name: z.string().min(1).max(80),
  dayOfMonth: z.number().int().min(1).max(31),
  type: typeEnum,
  categoryId: idSchema.nullable().optional(),
  defaultAmount: finiteNumber.optional(),
});

export const templatePatchSchema = templateInputSchema.partial();

export const snapshotInputSchema = z.object({
  date: isoDateSchema,
  balance: finiteNumber,
});
```

- [ ] **Step 2: Apply parsing in main process**

Open `electron/index.ts`. For each `ipcMain.handle` that receives a payload, insert at the start:

Example — `add-category`:

```ts
import {
  yearMonthSchema, isoDateSchema, idSchema, finiteNumber,
  categoryInputSchema, categoryPatchSchema,
  templateInputSchema, templatePatchSchema,
  snapshotInputSchema,
} from './schemas';

ipcMain.handle('add-category', (_e, raw: unknown) => {
  const input = categoryInputSchema.parse(raw);
  return addCategory(input);
});

ipcMain.handle('update-category', (_e, rawId: unknown, rawPatch: unknown) => {
  const id = idSchema.parse(rawId);
  const patch = categoryPatchSchema.parse(rawPatch);
  return updateCategory(id, patch);
});

ipcMain.handle('delete-category', (_e, rawId: unknown) => {
  const id = idSchema.parse(rawId);
  return deleteCategory(id);
});

ipcMain.handle('set-balance', (_e, rawBalance: unknown) => {
  const balance = finiteNumber.parse(rawBalance);
  return setBalance(balance);
});

ipcMain.handle('set-monthly-amount', (_e, rawTemplateId: unknown, rawYm: unknown, rawAmount: unknown) => {
  const templateId = idSchema.parse(rawTemplateId);
  const yearMonth = yearMonthSchema.parse(rawYm);
  const amount = finiteNumber.parse(rawAmount);
  return setMonthlyAmount(templateId, yearMonth, amount);
});
```

Apply the same pattern to **every** `ipcMain.handle` in `electron/index.ts` that takes arguments. Read-only handlers (e.g. `get-balance`) that take no payload — no change. Handlers that take a simple `string` (e.g. `get-monthly-amounts(yearMonth)`) use `yearMonthSchema.parse`.

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: electron main builds without TS errors.

- [ ] **Step 4: Run app; confirm basic flows**

```bash
npm run dev
```
Expected: add/update/delete category, edit a monthly amount — all work, no validation errors surfacing in console.

- [ ] **Step 5: Commit**

```bash
git add electron/schemas.ts electron/index.ts
git commit -m "feat(electron): add Zod validation to all IPC main handlers"
```

---

## Task 21: lib/ipc.ts ラッパー（renderer 側）

**Files:**
- Create: `src/lib/schemas.ts`
- Create: `src/lib/ipc.ts`

- [ ] **Step 1: Create renderer-side schemas (mirror of main)**

```ts
// src/lib/schemas.ts
import { z } from 'zod';

export const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const idSchema = z.number().int().nonnegative();

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.enum(['income', 'expense']),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const templateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  dayOfMonth: z.number().int(),
  type: z.enum(['income', 'expense']),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  categoryId: z.number().int().nullable(),
  defaultAmount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const snapshotSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  balance: z.number(),
  createdAt: z.string(),
});
```

- [ ] **Step 2: Create lib/ipc.ts wrapper**

```ts
// src/lib/ipc.ts
import { z } from 'zod';
import { useToastStore } from '../stores/useToastStore';

export const parseOrThrow = <T>(schema: z.ZodSchema<T>, data: unknown, context: string): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = `IPC response invalid: ${context}`;
    console.error(msg, result.error.issues, data);
    useToastStore.getState().addToast({ type: 'error', message: 'データ形式エラーが発生しました' });
    throw new Error(msg);
  }
  return result.data;
};

export const withToast = async <T>(op: () => Promise<T>, failMessage: string): Promise<T> => {
  try {
    return await op();
  } catch (e) {
    useToastStore.getState().addToast({ type: 'error', message: failMessage });
    throw e;
  }
};
```

- [ ] **Step 3: Apply in one store as example — `useCategoryStore`**

Open `src/stores/useCategoryStore.ts`. Locate the existing `fetchCategories` action and wrap:

```ts
import { parseOrThrow, withToast } from '../lib/ipc';
import { categorySchema } from '../lib/schemas';
import { z } from 'zod';

// inside the store:
fetchCategories: async () => {
  const raw = await withToast(() => window.electronAPI.getCategories(), 'カテゴリの取得に失敗しました');
  const categories = parseOrThrow(z.array(categorySchema), raw, 'getCategories');
  set({ categories });
},
```

Repeat the pattern in:
- `useTemplateStore.fetchTemplates` → `z.array(templateSchema)`
- `useSnapshotStore.fetchSnapshots` → `z.array(snapshotSchema)`

Keep mutation handlers (`add*`, `update*`) minimal: only wrap the await in `withToast` for now; trust main-side Zod for input validation.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Expected: app loads, all data fetches succeed. Errors (if any) appear as toast.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas.ts src/lib/ipc.ts src/stores/useCategoryStore.ts src/stores/useTemplateStore.ts src/stores/useSnapshotStore.ts
git commit -m "feat: add Zod-validated IPC wrapper on renderer side"
```

---

## Task 22: a11y 基盤パス（focus-visible + aria）

**Files:**
- Modify: `src/index.css` (global focus outline reset)
- Modify: several components lacking `aria-label`

- [ ] **Step 1: Add global focus-visible reset**

Append to `src/index.css`:

```css
/* Accessibility */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Grep for interactive elements missing aria-label**

```bash
```
Grep `<button` in `src/components` without `aria-label=` or child text. Record the files. Typical candidates: any icon-only button in `EntryRow.tsx`, `SnapshotList.tsx`, `ForecastChart.tsx` period selector, `UpcomingEvents.tsx`.

- [ ] **Step 3: Patch each identified icon-only button**

For each, convert to `IconButton` (from `ui/IconButton.tsx`) passing `label="..."` in Japanese describing the action. Example:

```tsx
// Before:
<button onClick={onDelete}><TrashIcon /></button>
// After:
<IconButton label="スナップショットを削除" icon={<TrashIcon />} onClick={onDelete} tone="danger" />
```

- [ ] **Step 4: Add `aria-current` to Sidebar items**

Open `src/components/sidebar/Sidebar.tsx` (or wherever nav items live). For each nav button representing a view, add `aria-current={active ? 'page' : undefined}` and wrap the `<nav>` with `aria-label="Primary"`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit -p tsconfig.web.json
npm run dev
```
Tab through the app — every interactive element receives a visible focus ring. Screen reader (VoiceOver) announces labels for icon buttons.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(a11y): add focus-visible outlines, aria-labels, reduced-motion"
```

---

## Task 23: Phase 1 総合動作確認

**Files:** none (verification only)

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
```
Expected: 0 errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```
Expected: electron main + preload + renderer all build without errors.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev` and verify each feature area:
- Dashboard: ForecastChart renders, SankeyChart month nav works, UpcomingEvents displays.
- Entries: Month nav, category groups, add/edit/delete template, copy previous month.
- History: Snapshot list, add new snapshot.
- Analytics: All 4 charts render, period selector works.
- Settings: Category CRUD through dialog, balance input.
- Toast notifications appear for success/failure actions.
- Tab navigation reaches every interactive element with a focus ring.

- [ ] **Step 4: Final commit (if fixes made)**

If any fixes were needed during smoke test, commit them:

```bash
git add -A
git commit -m "fix: Phase 1 smoke test corrections"
```

- [ ] **Step 5: Tag Phase 1 milestone (optional)**

```bash
git tag -a phase1-foundation -m "Phase 1: foundation refactor complete"
```

---

## Phase 1 Completion Criteria

- [ ] All design tokens defined in `src/theme/tokens.ts` and wired via Tailwind `@theme`.
- [ ] `components/ui/*` contains Button, IconButton, Card, Input, NumberInput, Select, Tabs, Dialog, ConfirmDialog, Badge, Tooltip, Skeleton, EmptyState, Toast.
- [ ] `useUIStore` exists and is the single source of truth for `theme`, `selectedYearMonth`, `sidebarCollapsed`.
- [ ] `SankeyChart`, `CategoryManager`, `EntriesView` all split to ≤200 LOC per file.
- [ ] `useCashFlowData` hook exists.
- [ ] All Electron `ipcMain.handle` handlers validate input via Zod schemas.
- [ ] `lib/ipc.ts` wraps major renderer reads with schema parsing + toast-on-failure.
- [ ] All icon-only buttons carry `aria-label` (via `IconButton`).
- [ ] Global `focus-visible` ring + `prefers-reduced-motion` rule in CSS.
- [ ] `npm run build` succeeds.
- [ ] Manual smoke test passes for all five views.

---

## Next

Phase 2 (UI/UX 刷新) is tracked in `docs/superpowers/plans/2026-04-17-phase2-ui-ux.md` — to be written separately.
