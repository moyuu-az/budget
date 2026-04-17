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
