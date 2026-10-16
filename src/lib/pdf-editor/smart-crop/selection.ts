/**
 * Smart Crop — selection state for tap-to-select (plan R1.1).
 *
 * Pure, so every rule is unit-tested in node:
 * - a tap on an unselected section adds it;
 * - a tap on a selected section removes it;
 * - a quick repeat tap on the same spot steps outward through the hit chain
 *   (leaf → parent → … → root) and wraps back to the smallest;
 * - the crop window snaps to the union of what is selected.
 */

import { sameRect } from './hit-test';
import { unionRects, type NormRect, type Section } from './types';

/** A repeat tap must land within this time of the previous one to step outward. */
export const REPEAT_MS = 1200;

export type TapPoint = { x: number; y: number; at: number };

export type Selection = {
  /** Selected sections, in the order they were added. */
  items: Section[];
  /** The last tap that added or stepped, so a repeat can walk its chain. */
  last: { x: number; y: number; at: number; chain: Section[]; index: number; itemId: string } | null;
};

export type TapOutcome =
  | { kind: 'added'; section: Section; chainLength: number }
  | { kind: 'removed'; section: Section }
  | { kind: 'stepped'; section: Section; from: Section; chainIndex: number; chainLength: number }
  | { kind: 'nothing' };

export function emptySelection(): Selection {
  return { items: [], last: null };
}

export function selectionRect(sel: Selection): NormRect | null {
  return unionRects(sel.items.map((s) => s.rect));
}

export function isSelected(sel: Selection, s: Section): boolean {
  return sel.items.some((it) => it.id === s.id || sameRect(it.rect, s.rect));
}

/** Replace everything with one section — Prev / Next, and keyboard-free use. */
export function selectOnly(s: Section): Selection {
  return { items: [s], last: null };
}

/**
 * Apply a tap. `chain` is what is under the point, smallest first — from
 * `hitChain`, with a grown block in front when no detected leaf was hit.
 * `slop` is the repeat-tap radius in page fractions (the caller converts its
 * screen-px radius, since the stage size is only known there).
 */
export function applyTap(
  sel: Selection,
  chain: Section[],
  tap: TapPoint,
  slop: number,
): { sel: Selection; outcome: TapOutcome } {
  if (chain.length === 0) return { sel: { ...sel, last: null }, outcome: { kind: 'nothing' } };

  const last = sel.last;
  const repeat =
    last !== null &&
    last.chain.length > 1 &&
    tap.at - last.at <= REPEAT_MS &&
    Math.abs(tap.x - last.x) <= slop &&
    Math.abs(tap.y - last.y) <= slop &&
    sel.items.some((it) => it.id === last.itemId);

  if (repeat && last) {
    const index = (last.index + 1) % last.chain.length;
    const next = last.chain[index];
    const from = sel.items.find((it) => it.id === last.itemId)!;
    const items = sel.items
      .map((it) => (it.id === last.itemId ? next : it))
      .filter((it, i, arr) => arr.findIndex((o) => o.id === it.id) === i);
    return {
      sel: { items, last: { ...last, at: tap.at, index, itemId: next.id } },
      outcome: { kind: 'stepped', section: next, from, chainIndex: index, chainLength: last.chain.length },
    };
  }

  const target = chain[0];
  if (isSelected(sel, target)) {
    return {
      sel: { items: sel.items.filter((it) => !(it.id === target.id || sameRect(it.rect, target.rect))), last: null },
      outcome: { kind: 'removed', section: target },
    };
  }

  return {
    sel: {
      items: [...sel.items, target],
      last: { x: tap.x, y: tap.y, at: tap.at, chain, index: 0, itemId: target.id },
    },
    outcome: { kind: 'added', section: target, chainLength: chain.length },
  };
}
