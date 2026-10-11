import type { View } from 'react-native';

export type WindowRect = { x: number; y: number; w: number; h: number };

const targets = new Map<string, View>();
let scroller: ((dy: number) => void) | null = null;

export function registerWalkthroughTarget(id: string, node: View | null) {
  if (node) targets.set(id, node);
  else targets.delete(id);
}

export function hasWalkthroughTarget(id: string): boolean {
  return targets.has(id);
}

export function measureWalkthroughTarget(id: string): Promise<WindowRect | null> {
  const node = targets.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    node.measureInWindow((x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
  });
}

/** The screen's ScrollView registers this so the tour can bring off-screen targets into view. */
export function setWalkthroughScroller(fn: ((dy: number) => void) | null) {
  scroller = fn;
}

export function scrollWalkthroughBy(dy: number): boolean {
  if (!scroller) return false;
  scroller(dy);
  return true;
}
