import { boxOf, type CanvasBounds } from '@/lib/editor/engine';
import type { LabelElement } from '@/lib/label-document';

export type EditorSelection = {
  ids: string[];
  primaryId: string | null;
};

export type TapSelectInput = {
  id: string;
  multipleMode: boolean;
  current: EditorSelection;
};

/** Tap-to-select: single replaces; multiple toggles membership (add or remove). */
export function reduceTapSelect(input: TapSelectInput): EditorSelection {
  const { id, multipleMode, current } = input;

  if (!multipleMode) {
    return { ids: [id], primaryId: id };
  }

  if (current.ids.includes(id)) {
    const ids = current.ids.filter((memberId) => memberId !== id);
    if (ids.length === 0) {
      return clearSelection();
    }
    const primaryId =
      current.primaryId && current.primaryId !== id && ids.includes(current.primaryId)
        ? current.primaryId
        : ids[ids.length - 1];
    return { ids, primaryId };
  }

  return { ids: [...current.ids, id], primaryId: id };
}

export function clearSelection(): EditorSelection {
  return { ids: [], primaryId: null };
}

/** Multiple ON keeps the current selection (carry-forward). OFF clears immediately. */
export function reduceMultipleModeToggle(
  turningOn: boolean,
  current: EditorSelection,
): EditorSelection {
  if (turningOn) return current;
  return clearSelection();
}

export function selectionFromIds(ids: string[], primaryId?: string | null): EditorSelection {
  if (ids.length === 0) {
    return clearSelection();
  }
  const primary = primaryId && ids.includes(primaryId) ? primaryId : ids[ids.length - 1];
  return { ids, primaryId: primary };
}

export function unionBounds(elements: LabelElement[]) {
  if (elements.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  for (const el of elements) {
    const box = boxOf(el);
    minLeft = Math.min(minLeft, box.left);
    minTop = Math.min(minTop, box.top);
    maxRight = Math.max(maxRight, box.left + box.width);
    maxBottom = Math.max(maxBottom, box.top + box.height);
  }
  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

/** Align the union bounding box of elements, then translate each member by the same delta. */
export function alignGroupBounds(
  elements: LabelElement[],
  ids: string[],
  canvas: CanvasBounds,
  kind: 'left' | 'right' | 'top' | 'bottom' | 'center',
): Map<string, { left: number; top: number }> {
  const selected = elements.filter((el) => ids.includes(el.id));
  const patches = new Map<string, { left: number; top: number }>();
  if (selected.length === 0) return patches;

  const group = unionBounds(selected);
  const maxLeft = Math.max(0, canvas.widthMm - group.width);
  const maxTop = Math.max(0, canvas.heightMm - group.height);

  let targetLeft = group.left;
  let targetTop = group.top;

  switch (kind) {
    case 'left':
      targetLeft = 0;
      break;
    case 'right':
      targetLeft = maxLeft;
      break;
    case 'top':
      targetTop = 0;
      break;
    case 'bottom':
      targetTop = maxTop;
      break;
    case 'center':
      targetLeft = maxLeft / 2;
      targetTop = maxTop / 2;
      break;
  }

  const deltaLeft = targetLeft - group.left;
  const deltaTop = targetTop - group.top;

  for (const el of selected) {
    patches.set(el.id, {
      left: el.left + deltaLeft,
      top: el.top + deltaTop,
    });
  }

  return patches;
}

export type MemberAlignKind = 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v';

function movableSelected(elements: LabelElement[], ids: string[]): LabelElement[] {
  return elements.filter(
    (el) => ids.includes(el.id) && !el.lockMovement && el.type !== 'border',
  );
}

/** Align selected members to each other (not to the label). Needs 2+ movable elements. */
export function alignMembersToEachOther(
  elements: LabelElement[],
  ids: string[],
  kind: MemberAlignKind,
): Map<string, { left: number; top: number }> {
  const selected = movableSelected(elements, ids);
  const patches = new Map<string, { left: number; top: number }>();
  if (selected.length < 2) return patches;

  switch (kind) {
    case 'left': {
      const target = Math.min(...selected.map((el) => el.left));
      for (const el of selected) patches.set(el.id, { left: target, top: el.top });
      break;
    }
    case 'right': {
      const target = Math.max(...selected.map((el) => el.left + boxOf(el).width));
      for (const el of selected) {
        patches.set(el.id, { left: target - boxOf(el).width, top: el.top });
      }
      break;
    }
    case 'top': {
      const target = Math.min(...selected.map((el) => el.top));
      for (const el of selected) patches.set(el.id, { left: el.left, top: target });
      break;
    }
    case 'bottom': {
      const target = Math.max(...selected.map((el) => el.top + boxOf(el).height));
      for (const el of selected) {
        patches.set(el.id, { left: el.left, top: target - boxOf(el).height });
      }
      break;
    }
    case 'center-h': {
      const centers = selected.map((el) => el.left + boxOf(el).width / 2);
      const target = centers.reduce((sum, c) => sum + c, 0) / centers.length;
      for (const el of selected) {
        patches.set(el.id, { left: target - boxOf(el).width / 2, top: el.top });
      }
      break;
    }
    case 'center-v': {
      const centers = selected.map((el) => el.top + boxOf(el).height / 2);
      const target = centers.reduce((sum, c) => sum + c, 0) / centers.length;
      for (const el of selected) {
        patches.set(el.id, { left: el.left, top: target - boxOf(el).height / 2 });
      }
      break;
    }
  }

  return patches;
}

/** Evenly space selected members between the outer two along one axis. Needs 3+ for a visible gap change. */
export function distributeMembers(
  elements: LabelElement[],
  ids: string[],
  axis: 'h' | 'v',
): Map<string, { left: number; top: number }> {
  const selected = movableSelected(elements, ids);
  const patches = new Map<string, { left: number; top: number }>();
  if (selected.length < 2) return patches;

  if (axis === 'h') {
    const ordered = [...selected].sort(
      (a, b) => a.left + boxOf(a).width / 2 - (b.left + boxOf(b).width / 2),
    );
    if (ordered.length === 2) {
      // With two items, pin the left and push the right so centers are midpoint-spaced by gap 0 — no-op.
      return patches;
    }
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const firstCenter = first.left + boxOf(first).width / 2;
    const lastCenter = last.left + boxOf(last).width / 2;
    const step = (lastCenter - firstCenter) / (ordered.length - 1);
    ordered.forEach((el, i) => {
      if (i === 0 || i === ordered.length - 1) {
        patches.set(el.id, { left: el.left, top: el.top });
        return;
      }
      const center = firstCenter + step * i;
      patches.set(el.id, { left: center - boxOf(el).width / 2, top: el.top });
    });
    return patches;
  }

  const ordered = [...selected].sort(
    (a, b) => a.top + boxOf(a).height / 2 - (b.top + boxOf(b).height / 2),
  );
  if (ordered.length === 2) return patches;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const firstCenter = first.top + boxOf(first).height / 2;
  const lastCenter = last.top + boxOf(last).height / 2;
  const step = (lastCenter - firstCenter) / (ordered.length - 1);
  ordered.forEach((el, i) => {
    if (i === 0 || i === ordered.length - 1) {
      patches.set(el.id, { left: el.left, top: el.top });
      return;
    }
    const center = firstCenter + step * i;
    patches.set(el.id, { left: el.left, top: center - boxOf(el).height / 2 });
  });
  return patches;
}

export function elementContentValue(el: LabelElement): string {
  if (el.type === 'text' || el.type === 'arctext') {
    return el.text;
  }
  if (
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'degrees'
  ) {
    return el.content;
  }
  return '';
}

export function contentPatchForElement(
  el: LabelElement,
  value: string,
): Record<string, unknown> {
  if (el.type === 'text' || el.type === 'arctext') {
    return { text: value };
  }
  if (
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'degrees'
  ) {
    return { content: value };
  }
  return {};
}

export function supportsMultiSelectPanel(el: LabelElement): boolean {
  return (
    el.type === 'text' ||
    el.type === 'barcode' ||
    el.type === 'qrcode' ||
    el.type === 'arctext' ||
    el.type === 'degrees'
  );
}
