/**
 * How the crop camera frames the window.
 * Scale is applied about the page centre, then `tx` / `ty` (screen px).
 * A scale of 1 with no translation leaves the page where it was fitted.
 */
export type CropFocus = {
  scale: number;
  tx: number;
  ty: number;
};

const FOCUS_PAD = 48;
const FOCUS_MAX = 2.5;

export function cropFocusTransform(args: {
  pageW: number;
  pageH: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  stageW: number;
  stageH: number;
  /** When false the page stays at its fitted size so the rest of it can be tapped. */
  focus: boolean;
}): CropFocus {
  if (!args.focus || args.pageW < 1 || args.pageH < 1) return { scale: 1, tx: 0, ty: 0 };
  // A window that already covers most of the page stays put. Focusing it would
  // pan the page after every small drag.
  if (args.cropW >= args.pageW * 0.82 && args.cropH >= args.pageH * 0.82) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const availW = Math.max(1, args.stageW - FOCUS_PAD * 2);
  const availH = Math.max(1, args.stageH - FOCUS_PAD * 2);
  const raw = Math.min(availW / Math.max(args.cropW, 1), availH / Math.max(args.cropH, 1));
  const scale = Math.max(1, Math.min(raw, FOCUS_MAX));
  const cx = args.cropX + args.cropW / 2;
  const cy = args.cropY + args.cropH / 2;
  const tx = -(cx - args.pageW / 2) * scale;
  const ty = -(cy - args.pageH / 2) * scale;
  return {
    scale,
    tx: tx === 0 ? 0 : tx,
    ty: ty === 0 ? 0 : ty,
  };
}
