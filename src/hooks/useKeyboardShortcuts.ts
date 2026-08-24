import { useEffect, useRef } from 'react';
import type { ViewType } from '../types';
import { useUIStore } from '../stores/useUIStore';

interface Options {
  onNavigate: (view: ViewType) => void;
  onShowHelp: () => void;
}

const GO_TO_VIEW: Record<string, ViewType> = {
  d: 'dashboard',
  e: 'entries',
  h: 'history',
  a: 'analytics',
  s: 'settings',
  // 'a' was already taken by 分析; 'w' for wealth keeps every view reachable
  // without renaming a shortcut people have already learnt.
  w: 'assets',
};

const CHORD_TIMEOUT_MS = 1200;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
};

export const useKeyboardShortcuts = ({ onNavigate, onShowHelp }: Options): void => {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  // Refs keep the latest callbacks without re-binding the global listener.
  const navigateRef = useRef(onNavigate);
  const helpRef = useRef(onShowHelp);
  navigateRef.current = onNavigate;
  helpRef.current = onShowHelp;

  useEffect(() => {
    let goPending = false;
    let goTimer: ReturnType<typeof setTimeout> | undefined;

    const clearGo = (): void => {
      goPending = false;
      if (goTimer) {
        clearTimeout(goTimer);
        goTimer = undefined;
      }
    };

    const handler = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (goPending) {
        const view = GO_TO_VIEW[e.key.toLowerCase()];
        if (view) {
          e.preventDefault();
          navigateRef.current(view);
        }
        clearGo();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        helpRef.current();
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        goPending = true;
        goTimer = setTimeout(clearGo, CHORD_TIMEOUT_MS);
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearGo();
    };
  }, [toggleSidebar]);
};
