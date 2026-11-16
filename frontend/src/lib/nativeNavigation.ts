import { useLayoutEffect } from 'react';

type SwipeState = { document: string; sequence: number; blocked: boolean };
declare global {
  interface Window {
    __redoSwipeState?: SwipeState;
    webkit?: { messageHandlers?: { redoNavigation?: { postMessage: (state: SwipeState) => void } } };
  }
}

const locks = new Set<symbol>();
const documentId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let sequence = 0;

function publish(force = false) {
  const modal = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"], dialog[open]')]
    .some(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  const blocked = locks.size > 0 || modal;
  if (!force && window.__redoSwipeState?.blocked === blocked) return;
  const state = { document: documentId, sequence: ++sequence, blocked };
  window.__redoSwipeState = state;
  window.webkit?.messageHandlers?.redoNavigation?.postMessage(state);
}

// Each owner releases only its own lock. Releases are coalesced so React effect
// cleanup/setup cannot briefly enable navigation between two protected states.
export function blockNativeNavigation(): () => void {
  const token = Symbol();
  locks.add(token);
  publish();
  return () => {
    if (locks.delete(token)) queueMicrotask(publish);
  };
}

export function useNativeNavigationBlock(blocked: boolean): void {
  useLayoutEffect(() => blocked ? blockNativeNavigation() : undefined, [blocked]);
}

export function initNativeNavigation(): void {
  if (!window.webkit?.messageHandlers?.redoNavigation) return;
  const observer = new MutationObserver(() => publish());
  observer.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['hidden', 'open', 'aria-modal', 'class', 'style'],
  });
  window.addEventListener('pageshow', () => publish(true));
  publish(true);
}
