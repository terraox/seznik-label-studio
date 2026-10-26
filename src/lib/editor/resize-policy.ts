/**
 * Phase 5 resize policy — millimetres only.
 *
 * The RN transformer shows at most two edge anchors (middle-right, bottom-center).
 * Each element type has an explicit behavior (not “reuse image and hope”).
 *
 * Rotation stays on the editing pad / 90° control for aspect-locked types so the
 * selection chrome is just two arrows + a 1px outline.
 */

import { elementSizeMm, type ElementType, type LabelElement } from '@/lib/label-document';
import { finiteMm, MAX_ELEMENT_MM, MIN_ELEMENT_MM, roundMm, type CanvasBounds } from '@/lib/editor/engine';

/** Spec 5.2: proportional types cannot collapse below ~5mm. */
export const RESIZE_MIN_PROPORTIONAL_MM = 5;

export type ResizeAnchor = 'e' | 's';
export type ResizeBehavior = 'aspect' | 'square' | 'width' | 'height';

export type ResizePolicy = {
  anchors: ResizeAnchor[];
  behavior: Partial<Record<ResizeAnchor, ResizeBehavior>>;
  /** On-canvas rotate stem. False when rotation lives on the editing pad. */
  rotateHandle: boolean;
  minMm: number;
  /** Why this type resizes this way (Task 5.4). */
  comment: string;
};

export type MmBox = { left: number; top: number; width: number; height: number };

export function aspectRatioOf(element: LabelElement): number {
  if (element.type === 'qrcode' || element.type === 'arctext') return 1;
  if (element.type === 'image' && typeof element.originalAspect === 'number' && element.originalAspect > 0) {
    return element.originalAspect;
  }
  const size = elementSizeMm(element);
  if (!(size.height > 0)) return 1;
  return size.width / size.height;
}

export function resizePolicyFor(element: LabelElement): ResizePolicy {
  const type: ElementType = element.type;
  switch (type) {
    case 'border':
      return {
        anchors: [],
        behavior: {},
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Border is locked to the label; no resize handles.',
      };
    case 'line':
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: 0.1,
        comment: 'Line: length only. Stroke thickness is a property, not a drag axis.',
      };
    case 'qrcode':
    case 'arctext':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'square', s: 'square' },
        rotateHandle: false,
        minMm: RESIZE_MIN_PROPORTIONAL_MM,
        comment: 'QR and ArcText stay square and scale as a whole.',
      };
    case 'barcode':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'width', s: 'height' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment: 'Barcode: width and height independently. Live preview stretches the same bars; it does not re-snap modules while dragging.',
      };
    case 'text':
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment:
          'Text: width only. Height follows content; narrowing wraps onto more lines.',
      };
    case 'degrees':
      return {
        anchors: ['e'],
        behavior: { e: 'width' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment:
          'Counter/degrees: width only. Height follows wrapped content.',
      };
    case 'time':
      return {
        anchors: ['e', 's'],
        behavior: { e: 'width', s: 'height' },
        rotateHandle: false,
        minMm: MIN_ELEMENT_MM,
        comment:
          'Time: box width and height. One line only: a narrow box shrinks the type instead of wrapping.',
      };
    default:
      return {
        anchors: ['e', 's'],
        behavior: { e: 'aspect', s: 'aspect' },
        rotateHandle: false,
        minMm:
          type === 'image' || type === 'clipart' || type === 'signature'
            ? RESIZE_MIN_PROPORTIONAL_MM
            : MIN_ELEMENT_MM,
        comment:
          'Every element scales as a whole: both handles keep aspect, and live preview scales the content with the box.',
      };
  }
}

function clamp(n: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

function finiteAspect(aspect: number): number {
  'worklet';
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return aspect;
}

export type ScaleCapMember = {
  start: MmBox;
  minMm: number;
  behavior: ResizeBehavior;
  aspect: number;
};

/**
 * Resize one element by a shared scale. Origin (left, top) is always the start
 * origin — only width/height change. Used for both single-element and group resize.
 */
export function resizeMemberByScale(opts: {
  start: MmBox;
  handle: ResizeAnchor;
  behavior: ResizeBehavior;
  scaleX: number;
  scaleY: number;
  aspect: number;
  minMm: number;
  canvas: CanvasBounds;
  naturalHeightMm?: number;
  /** Element rotation in degrees (quarter turns). Turns the canvas limit onto the rotated axes. */
  rotation?: number;
}): MmBox {
  'worklet';
  const minMm = Math.max(0.1, finiteMm(opts.minMm, MIN_ELEMENT_MM));
  const maxW = Math.max(minMm, finiteMm(opts.canvas.widthMm, minMm));
  const maxH = Math.max(minMm, finiteMm(opts.canvas.heightMm, minMm));
  const startLeft = finiteMm(opts.start.left);
  const startTop = finiteMm(opts.start.top);
  const startW = Math.max(minMm, finiteMm(opts.start.width, minMm));
  const startH = Math.max(minMm, finiteMm(opts.start.height, minMm));
  const aspect = finiteAspect(opts.aspect);
  const scaleX = Number.isFinite(opts.scaleX) ? opts.scaleX : 1;
  const scaleY = Number.isFinite(opts.scaleY) ? opts.scaleY : 1;
  // The box turns about its centre and the resize keeps its top-left corner fixed on screen,
  // so each local axis grows toward a different canvas edge. Room along that edge is the limit.
  const turn = ((Math.round((opts.rotation ?? 0) / 90) * 90) % 360 + 360) % 360;
  let roomW = maxW - startLeft;
  let roomH = maxH - startTop;
  if (turn === 90) {
    roomW = maxH - (startTop + (startH - startW) / 2);
    roomH = startLeft + (startW + startH) / 2;
  } else if (turn === 180) {
    roomW = startLeft + startW;
    roomH = startTop + startH;
  } else if (turn === 270) {
    roomW = startTop + (startH + startW) / 2;
    roomH = maxW - (startLeft + (startW - startH) / 2);
  }
  const maxAllowedW = Math.max(minMm, Math.min(MAX_ELEMENT_MM, roomW));
  const maxAllowedH = Math.max(minMm, Math.min(MAX_ELEMENT_MM, roomH));

  let width = startW;
  let height = startH;

  if (opts.behavior === 'width' && opts.handle === 'e') {
    width = clamp(startW * scaleX, minMm, maxAllowedW);
    height = startH;
  } else if (opts.behavior === 'height' && opts.handle === 's') {
    height = clamp(startH * scaleY, minMm, maxAllowedH);
    width = startW;
  } else if (opts.behavior === 'square') {
    const driving = opts.handle === 'e' ? startW * scaleX : startH * scaleY;
    const side = clamp(driving, minMm, Math.min(maxAllowedW, maxAllowedH));
    width = side;
    height = side;
  } else if (opts.behavior === 'aspect') {
    if (opts.handle === 'e') {
      const maxAvailW = Math.min(maxAllowedW, maxAllowedH * aspect);
      width = clamp(startW * scaleX, minMm, maxAvailW);
      height = width / aspect;
    } else {
      const maxAvailH = Math.min(maxAllowedH, maxAllowedW / aspect);
      height = clamp(startH * scaleY, minMm, maxAvailH);
      width = height * aspect;
    }
  } else if (opts.handle === 'e') {
    width = clamp(startW * scaleX, minMm, maxAllowedW);
  } else {
    height = clamp(startH * scaleY, minMm, maxAllowedH);
  }

  const naturalH = opts.naturalHeightMm;
  if (typeof naturalH === 'number' && Number.isFinite(naturalH)) {
    height = clamp(naturalH, minMm, maxAllowedH);
  } else {
    height = clamp(height, minMm, maxAllowedH);
  }
  width = clamp(width, minMm, maxAllowedW);

  return {
    left: roundMm(startLeft),
    top: roundMm(startTop),
    width: roundMm(width),
    height: roundMm(height),
  };
}

function minDrivingScale(member: ScaleCapMember, handle: ResizeAnchor): number {
  'worklet';
  const minMm = Math.max(0.1, finiteMm(member.minMm, MIN_ELEMENT_MM));
  const startW = Math.max(0.001, finiteMm(member.start.width, minMm));
  const startH = Math.max(0.001, finiteMm(member.start.height, minMm));
  if (member.behavior === 'square') {
    return Math.max(minMm / startW, minMm / startH);
  }
  if (member.behavior === 'aspect') {
    return handle === 'e' ? minMm / startW : minMm / startH;
  }
  if (handle === 'e') {
    return member.behavior === 'height' ? 1 : minMm / startW;
  }
  return member.behavior === 'width' ? 1 : minMm / startH;
}

function maxDrivingScale(member: ScaleCapMember, handle: ResizeAnchor, canvas: CanvasBounds): number {
  'worklet';
  const minMm = Math.max(0.1, finiteMm(member.minMm, MIN_ELEMENT_MM));
  const startLeft = finiteMm(member.start.left);
  const startTop = finiteMm(member.start.top);
  const startW = Math.max(0.001, finiteMm(member.start.width, minMm));
  const startH = Math.max(0.001, finiteMm(member.start.height, minMm));
  const maxW = Math.max(minMm, finiteMm(canvas.widthMm, minMm) - startLeft);
  const maxH = Math.max(minMm, finiteMm(canvas.heightMm, minMm) - startTop);
  const aspect = finiteAspect(member.aspect);

  if (member.behavior === 'square') {
    return Math.min(maxW / startW, maxH / startH);
  }
  if (member.behavior === 'aspect') {
    if (handle === 'e') {
      return Math.min(maxW / startW, (maxH * aspect) / startW);
    }
    return Math.min(maxH / startH, maxW / (startH * aspect));
  }
  if (handle === 'e') {
    return member.behavior === 'height' ? 1 : maxW / startW;
  }
  return member.behavior === 'width' ? 1 : maxH / startH;
}

/** Coupled min/max for the shared driving scale (Design Decision #4). */
export function sharedScaleLimits(opts: {
  members: ScaleCapMember[];
  handle: ResizeAnchor;
  canvas: CanvasBounds;
}): { minScale: number; maxScale: number } {
  'worklet';
  let floor = 0;
  let ceil = Number.POSITIVE_INFINITY;
  for (let i = 0; i < opts.members.length; i++) {
    const member = opts.members[i];
    floor = Math.max(floor, minDrivingScale(member, opts.handle));
    ceil = Math.min(ceil, maxDrivingScale(member, opts.handle, opts.canvas));
  }
  if (!(ceil >= floor)) {
    ceil = floor;
  }
  return { minScale: floor, maxScale: ceil };
}

/** Cap a proposed shared scale so every member stays in [minMm, remaining-canvas]. */
export function capSharedScale(opts: {
  members: ScaleCapMember[];
  handle: ResizeAnchor;
  scaleX: number;
  scaleY: number;
  canvas: CanvasBounds;
}): { scaleX: number; scaleY: number } {
  'worklet';
  const limits = sharedScaleLimits({
    members: opts.members,
    handle: opts.handle,
    canvas: opts.canvas,
  });
  const linked = Math.abs(opts.scaleX - opts.scaleY) < 1e-6;
  const driving = opts.handle === 'e' ? opts.scaleX : opts.scaleY;
  const capped = clamp(driving, limits.minScale, limits.maxScale);
  if (opts.handle === 'e') {
    return { scaleX: capped, scaleY: linked ? capped : 1 };
  }
  return { scaleX: linked ? capped : 1, scaleY: capped };
}

/**
 * `boundBoxFunc` in millimetres: opposite edge stays put. Delegates to
 * resizeMemberByScale so single-element and group resize share one function.
 */
export function boundBoxMm(opts: {
  anchor: ResizeAnchor;
  behavior: ResizeBehavior;
  start: MmBox;
  proposed: { width: number; height: number };
  aspect: number;
  minMm: number;
  canvas: CanvasBounds;
  naturalHeightMm?: number;
}): MmBox {
  'worklet';
  const minMm = Math.max(0.1, finiteMm(opts.minMm, MIN_ELEMENT_MM));
  const startW = Math.max(minMm, finiteMm(opts.start.width, minMm));
  const startH = Math.max(minMm, finiteMm(opts.start.height, minMm));
  const proposedW = Math.max(minMm, finiteMm(opts.proposed.width, startW));
  const proposedH = Math.max(minMm, finiteMm(opts.proposed.height, startH));
  const scaleX = proposedW / startW;
  const scaleY = proposedH / startH;
  return resizeMemberByScale({
    start: opts.start,
    handle: opts.anchor,
    behavior: opts.behavior,
    scaleX,
    scaleY,
    aspect: opts.aspect,
    minMm,
    canvas: opts.canvas,
    naturalHeightMm: opts.naturalHeightMm,
  });
}
