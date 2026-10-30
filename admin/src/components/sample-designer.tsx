'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BringToFront, Clipboard, ClipboardPaste, Copy, Maximize,
  Minus, Plus, QrCode, Redo2, RotateCcw, RotateCw, ScanBarcode, SendToBack, Sparkles, Trash2, Type, Undo2, X,
} from 'lucide-react';

import { useToast } from '@/components/desk';
import { api } from '@/lib/client';
import {
  APP_FONT, INK, INK_BLACK, PT_MM, barcodeBars, barcodeFontPt, qrModules, textHeightMm, textLineMm, textPadXMm, textPadYMm,
} from '@/lib/sample-render';
import { USE_CASES, guessUseCase, suggestForTemplate, type UseCase } from '@/lib/sample-suggest';
import { sampleVisualBox, type SampleElement, type SampleElementType, type SampleRotation } from '@/lib/sample-layout';

type Template = { id: string; name: string; widthMm: number | null; heightMm: number | null; svgCode: string; sampleLayout?: unknown };
type Mode = 'move' | 'e' | 's';
/** Moving or resizing elements (`starts` holds every element that moves), or drawing a selection box. */
type Drag =
  | { kind: 'el'; id: string; mode: Mode; sx: number; sy: number; start: SampleElement; starts: SampleElement[]; moved: boolean }
  | { kind: 'box'; sx: number; sy: number; add: string[]; moved: boolean };
type Box = { left: number; top: number; width: number; height: number };
type Guide = { axis: 'x' | 'y'; at: number };

// The app's selection chrome (lib/editor/canvas-chrome.ts).
const SELECTION = '#E8543C';
const HANDLE = '#42BCC7';
const GUIDE = 'rgba(45, 175, 229, 0.65)';
const HANDLE_PX = 22;
const RULER = 22;
const PAD = 40;
/** The app's default text size and minimum sizes (types.ts, resize-policy.ts, engine.ts). */
const TEXT_PT = 8.5;
const MIN_MM = 0.5;
const MIN_SQUARE_MM = 5;
const SNAP_PX = 6;
const NUDGE_MM = 0.5;
/** The app turns elements in quarter turns only, about the box centre. */
const ANGLES: SampleRotation[] = [0, 90, 180, 270];
const turned = (el: SampleElement, by: number) => (((((el.rotation ?? 0) + by) % 360) + 360) % 360) as SampleRotation;

const TYPE_NAME: Record<SampleElementType, string> = { text: 'Text', barcode: 'Barcode', qrcode: 'QR code', line: 'Line' };
const TYPE_ICON: Record<SampleElementType, typeof Type> = { text: Type, barcode: ScanBarcode, qrcode: QrCode, line: Minus };
/** Which edge handles each type gets in the app, and what they change. */
const HANDLES: Record<SampleElementType, ('e' | 's')[]> = { text: ['e'], line: ['e'], barcode: ['e', 's'], qrcode: ['e', 's'] };

const round = (n: number) => Math.round(n * 100) / 100;
/** Copied elements, kept while the admin is open so they can be pasted into another template too. */
let clipboard: SampleElement[] = [];
/** The box around several turned or upright elements, as seen on the label. */
function boundsOf(els: SampleElement[]): Box {
  const boxes = els.map(sampleVisualBox);
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  return { left, top, width: Math.max(...boxes.map((b) => b.left + b.width)) - left, height: Math.max(...boxes.map((b) => b.top + b.height)) - top };
}
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
let counter = 0;
const newId = () => `e${Date.now().toString(36)}${(counter += 1)}`;

/** The template outline, stretched over the label the way the app's TemplateSvgOverlay draws it. */
function stretchedSvg(svg: string) {
  const root = svg.replace(/<svg\b[^>]*>/i, (tag) =>
    tag.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/gi, '').replace(/^<svg/i, '<svg preserveAspectRatio="none" width="100%" height="100%"'));
  return `data:image/svg+xml;utf8,${encodeURIComponent(root)}`;
}

/** Keeps the size rules the app applies: text height follows its lines, QR stays square. */
function fit(el: SampleElement): SampleElement {
  if (el.type === 'text') return { ...el, height: textHeightMm(el.text ?? '', el.width, el.fontSize ?? TEXT_PT, !!el.bold) };
  if (el.type === 'qrcode') return { ...el, height: el.width };
  return el;
}

function create(type: SampleElementType, w: number, h: number, existing: SampleElement[]): SampleElement {
  let el: SampleElement;
  if (type === 'text') {
    el = fit({ id: newId(), type, left: 0, top: 0, width: round(Math.min(w - 2, Math.max(10, w * 0.6))), height: 0, text: 'Text', fontSize: TEXT_PT, bold: false, align: 'left' });
  } else if (type === 'barcode') {
    el = { id: newId(), type, left: 0, top: 0, width: round(Math.min(26, w - 2)), height: round(Math.min(10, h / 2)), text: '0123456789' };
  } else if (type === 'qrcode') {
    const side = round(Math.max(MIN_SQUARE_MM, Math.min(12, w - 2, h - 2)));
    el = { id: newId(), type, left: 0, top: 0, width: side, height: side, text: 'https://seznik.in' };
  } else {
    el = { id: newId(), type: 'line', left: 0, top: 0, width: round(Math.min(33.6, w - 2)), height: 0.5 };
  }
  // Centred on the label, stepped down a little when something already sits there.
  let left = round((w - el.width) / 2);
  let top = round((h - el.height) / 2);
  while (existing.some((e) => Math.abs(e.left - left) < 0.2 && Math.abs(e.top - top) < 0.2)) { left = round(left + 2); top = round(top + 2); }
  return { ...el, left, top };
}

/** One sample element drawn as the app draws it. `scale` is px per mm. */
function ElementView({ el, scale }: { el: SampleElement; scale: number }) {
  const px = (mm: number) => mm * scale;
  if (el.type === 'text') {
    const pt = el.fontSize ?? TEXT_PT;
    return (
      <div className="sd-text" style={{
        padding: `${px(textPadYMm(pt))}px ${px(textPadXMm(pt))}px`, fontSize: px(pt * PT_MM), lineHeight: `${px(textLineMm(pt))}px`,
        fontWeight: el.bold ? 600 : 400, textAlign: el.align ?? 'left', fontFamily: APP_FONT, color: INK_BLACK,
      }}>{el.text}</div>
    );
  }
  if (el.type === 'barcode') return <BarcodeView el={el} scale={scale} />;
  if (el.type === 'qrcode') return <QrView text={el.text ?? ''} />;
  // A line is a bar as thick as the box, across its middle.
  return <div className="sd-line" style={{ height: Math.max(1, px(el.height)), background: INK }} />;
}

function BarcodeView({ el, scale }: { el: SampleElement; scale: number }) {
  const text = el.text || '0123456789';
  const bars = useMemo(() => barcodeBars(text, el.width), [text, el.width]);
  const w = el.width * scale;
  const labelPx = Math.max(1, barcodeFontPt(el.height) * PT_MM * scale);
  const bandPx = Math.max(Math.ceil(labelPx + 2), Math.round(labelPx * 1.25));
  if (!bars) return <div className="sd-invalid">Invalid barcode content</div>;
  const d = bars.map((b) => { const bw = Math.max(b.width * w, 0.55); return `M${b.x * w},0h${bw}v100h-${bw}Z`; }).join(' ');
  return (
    <div className="sd-barcode">
      <svg width="100%" style={{ flex: 1, minHeight: 0 }} viewBox={`0 0 ${w} 100`} preserveAspectRatio="none"><path d={d} fill={INK_BLACK} /></svg>
      <div style={{ height: bandPx, lineHeight: `${bandPx}px`, fontSize: labelPx, fontFamily: APP_FONT, color: INK_BLACK }}>{text}</div>
    </div>
  );
}

function QrView({ text }: { text: string }) {
  const qr = useMemo(() => qrModules(text || 'https://seznik.in'), [text]);
  if (!qr) return <div className="sd-invalid">Too long for a QR code</div>;
  let d = '';
  for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) if (qr.data[r * qr.size + c]) d += `M${c},${r}h1v1h-1Z`;
  return <svg width="100%" height="100%" viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges"><path d={d} fill={INK} /></svg>;
}

/**
 * A template with its sample content drawn on it, read-only, fitted into its box.
 * Used for the tiles, the viewer and the edit window. `layout` null or empty draws the blank template.
 */
export function SamplePreview({ svgCode, widthMm, heightMm, layout, dim }: { svgCode: string; widthMm: number | null; heightMm: number | null; layout?: unknown; dim?: boolean }) {
  const W = widthMm ?? 50;
  const H = heightMm ?? 30;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // Measured now, on the next frame (a dialog may still be laying out) and on every resize.
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, []);
  const src = useMemo(() => stretchedSvg(svgCode), [svgCode]);
  const elements = useMemo(() => (Array.isArray(layout) ? (layout as SampleElement[]).map(fit) : []), [layout]);
  const scale = size.w && size.h ? Math.min(size.w / W, size.h / H) : 0;
  return (
    <div ref={box} className={`sd-preview${dim ? ' dim' : ''}`}>
      {scale ? (
        <div className="sd-preview-label" style={{ width: W * scale, height: H * scale }}>
          <img className="sd-template" src={src} alt="" draggable={false} />
          {elements.map((el) => (
            <div key={el.id} className={`sd-pv-el ${el.type}`} style={{ left: el.left * scale, top: el.top * scale, width: el.width * scale, height: Math.max(1, el.height * scale), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>
              <ElementView el={el} scale={scale} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Millimetre ruler along one side of the label, with the selected element's span shaded, like the app's. */
function Ruler({ axis, lengthMm, scale, band }: { axis: 'x' | 'y'; lengthMm: number; scale: number; band: [number, number] | null }) {
  const len = lengthMm * scale;
  const minor = scale >= 6 ? 1 : scale >= 2 ? 5 : 10;
  const major = scale >= 14 ? 5 : 10;
  const ticks: { at: number; size: number; label?: number }[] = [];
  for (let mm = 0; mm <= lengthMm + 1e-6; mm += minor) {
    const m = Math.round(mm * 100) / 100;
    const isMajor = Math.abs(m / major - Math.round(m / major)) < 1e-6;
    ticks.push({ at: m * scale, size: isMajor ? 9 : Math.abs(m / 5 - Math.round(m / 5)) < 1e-6 ? 6 : 4, label: isMajor ? m : undefined });
  }
  const horizontal = axis === 'x';
  return (
    <svg className={`sd-ruler ${axis}`} width={horizontal ? len : RULER} height={horizontal ? RULER : len}>
      {band ? (horizontal
        ? <rect x={band[0] * scale} y={0} width={Math.max(1, (band[1] - band[0]) * scale)} height={RULER} className="sd-ruler-band" />
        : <rect x={0} y={band[0] * scale} width={RULER} height={Math.max(1, (band[1] - band[0]) * scale)} className="sd-ruler-band" />) : null}
      {ticks.map((t) => (
        <g key={t.at}>
          {horizontal
            ? <line x1={t.at} x2={t.at} y1={RULER} y2={RULER - t.size} />
            : <line y1={t.at} y2={t.at} x1={RULER} x2={RULER - t.size} />}
          {t.label !== undefined && t.label > 0 && t.label < lengthMm ? (horizontal
            ? <text x={t.at} y={10} textAnchor="middle">{t.label}</text>
            : <text x={10} y={t.at} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 10 ${t.at})`}>{t.label}</text>) : null}
        </g>
      ))}
    </svg>
  );
}

/** The app's ↔ / ↕ handle icons. */
function HandleIcon({ mode }: { mode: 'e' | 's' }) {
  return (
    <svg width={13} height={13} viewBox="-10 -10 20 20" aria-hidden>
      <path fill="#fff" d={mode === 'e'
        ? 'M -3 -5 L -8.5 0 L -3 5 L -3 1.5 L 3 1.5 L 3 5 L 8.5 0 L 3 -5 L 3 -1.5 L -3 -1.5 Z'
        : 'M -5 -3 L 0 -8.5 L 5 -3 L 1.5 -3 L 1.5 3 L 5 3 L 0 8.5 L -5 3 L -1.5 3 L -1.5 -3 Z'} />
    </svg>
  );
}

function NumberField({ label, value, onChange, disabled, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; step?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="sd-num">
      <span>{label}</span>
      <input type="number" step={step} value={draft} disabled={disabled}
        onChange={(e) => { setDraft(e.target.value); const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) onChange(v); }}
        onBlur={() => setDraft(String(value))} />
    </label>
  );
}

export function SampleDesigner({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: (layout: SampleElement[]) => void }) {
  const toast = useToast();
  const W = template.widthMm ?? 50;
  const H = template.heightMm ?? 30;
  const initial = useMemo(() => (Array.isArray(template.sampleLayout) ? (template.sampleLayout as SampleElement[]) : []), [template.sampleLayout]);
  const [items, setItems] = useState<SampleElement[]>(() => initial.map(fit));
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.length === 1 ? selection[0] : null;
  const [marquee, setMarquee] = useState<Box | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pasteCount = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hud, setHud] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const variant = useRef(0);
  const [useCase, setUseCase] = useState<UseCase>(() => guessUseCase(template.name));
  const [area, setArea] = useState({ w: 800, h: 520 });
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Undo / redo. Typing into one field within a moment counts as one step.
  const past = useRef<SampleElement[][]>([]);
  const future = useRef<SampleElement[][]>([]);
  const lastTag = useRef<{ tag: string; at: number } | null>(null);
  const [, bump] = useState(0);
  const record = useCallback((tag?: string) => {
    const now = Date.now();
    if (tag && lastTag.current?.tag === tag && now - lastTag.current.at < 800) { lastTag.current.at = now; return; }
    lastTag.current = tag ? { tag, at: now } : null;
    past.current.push(itemsRef.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    bump((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(itemsRef.current);
    lastTag.current = null;
    setItems(prev); setDirty(true); bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(itemsRef.current);
    lastTag.current = null;
    setItems(next); setDirty(true); bump((n) => n + 1);
  }, []);

  /** Changes one element. `tag` groups quick repeats (typing, nudging) into one undo step. */
  const change = useCallback((id: string, patch: Partial<SampleElement>, tag?: string) => {
    record(tag ? `${tag}:${id}` : undefined);
    setItems((cur) => cur.map((e) => (e.id === id ? fit({ ...e, ...patch }) : e)));
    setDirty(true);
  }, [record]);
  /** Changes every element in `ids` in one undo step. */
  const changeMany = useCallback((ids: string[], patch: (e: SampleElement) => Partial<SampleElement>, tag?: string) => {
    if (!ids.length) return;
    record(tag ? `${tag}:${ids.join(',')}` : undefined);
    setItems((cur) => cur.map((e) => (ids.includes(e.id) ? fit({ ...e, ...patch(e) }) : e)));
    setDirty(true);
  }, [record]);
  const current = items.find((e) => e.id === selected) ?? null;
  const group = items.filter((e) => selection.includes(e.id));
  const currentBox = group.length ? boundsOf(group) : null;

  // Fit the label into the canvas area; zoom multiplies that.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitScale = Math.max(1, Math.min((area.w - PAD * 2 - RULER) / W, (area.h - PAD * 2 - RULER) / H));
  const scale = fitScale * zoom;
  const px = (mm: number) => mm * scale;

  function add(type: SampleElementType) {
    record();
    const el = create(type, W, H, items);
    setItems((cur) => [...cur, el]);
    setSelection([el.id]);
    setDirty(true);
  }
  /** Replaces the sample content with a suggestion for this shape and use case. One undo step. */
  function suggest() {
    if (items.length && !dirty && !window.confirm('Replace the current sample content with a suggestion?')) return;
    record();
    setItems(suggestForTemplate(template.svgCode, template.name, useCase, W, H, newId, variant.current++).map(fit));
    setSelection([]);
    setDirty(true);
  }
  function remove(ids: string[]) {
    if (!ids.length) return;
    record();
    setItems((cur) => cur.filter((e) => !ids.includes(e.id)));
    setSelection([]);
    setEditing(null);
    setDirty(true);
  }
  /** Adds copies of `els`, moved by `offset` mm, on top of everything and selected. */
  function place(els: SampleElement[], offset: number) {
    if (!els.length) return;
    record();
    const copies = els.map((el) => ({ ...el, id: newId(), left: round(el.left + offset), top: round(el.top + offset) }));
    setItems((cur) => [...cur, ...copies]);
    setSelection(copies.map((c) => c.id));
    setEditing(null);
    setDirty(true);
  }
  const duplicate = (els: SampleElement[]) => place(els, 2);
  function copy(els: SampleElement[], cut = false) {
    if (!els.length) return;
    clipboard = els.map((e) => ({ ...e }));
    pasteCount.current = 0;
    if (cut) remove(els.map((e) => e.id));
    toast(`${cut ? 'Cut' : 'Copied'} ${els.length === 1 ? '1 element' : `${els.length} elements`}`);
  }
  function paste() {
    if (!clipboard.length) return toast('Nothing copied yet', 'bad');
    // Each paste steps 2 mm further, so repeated pastes do not stack exactly.
    pasteCount.current += 1;
    place(clipboard, 2 * pasteCount.current);
  }
  /** Click selects one; Shift or Ctrl/⌘ adds it or takes it out. */
  function pick(id: string, toggle: boolean) {
    setSelection((cur) => (toggle ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  }
  function reorder(id: string, toFront: boolean) {
    record();
    setItems((cur) => { const el = cur.find((e) => e.id === id); if (!el) return cur; const rest = cur.filter((e) => e.id !== id); return toFront ? [...rest, el] : [el, ...rest]; });
    setDirty(true);
  }

  /** Snaps a moving edge set to the label's edges and centre and to the other elements. Returns the shift and the guide. */
  const snapAxis = useCallback((edges: number[], axis: 'x' | 'y', skip: string[]) => {
    const limit = axis === 'x' ? W : H;
    const targets = [0, limit / 2, limit];
    for (const o of itemsRef.current) {
      if (skip.includes(o.id)) continue;
      const b = sampleVisualBox(o);
      const a = axis === 'x' ? b.left : b.top;
      const s = axis === 'x' ? b.width : b.height;
      targets.push(a, a + s / 2, a + s);
    }
    const th = SNAP_PX / scale;
    let best: { shift: number; at: number } | null = null;
    for (const e of edges) for (const t of targets) {
      const d = t - e;
      if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: t };
    }
    return best;
  }, [W, H, scale]);

  function begin(event: React.PointerEvent, el: SampleElement, mode: Mode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (mode === 'move' && (event.shiftKey || event.metaKey || event.ctrlKey)) { pick(el.id, true); return; }
    // Pressing on a member of a group moves the whole group; anything else selects just that element.
    const ids = mode === 'move' && selection.includes(el.id) ? selection : [el.id];
    if (!(mode === 'move' && selection.includes(el.id))) setSelection([el.id]);
    if (editing && editing !== el.id) setEditing(null);
    const starts = itemsRef.current.filter((e) => ids.includes(e.id)).map((e) => ({ ...e }));
    drag.current = { kind: 'el', id: el.id, mode, sx: event.clientX, sy: event.clientY, start: { ...el }, starts, moved: false };
  }

  /** Pressing on empty canvas starts a selection box; Shift or Ctrl/⌘ keeps what is already selected. */
  function beginBox(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const keep = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!keep) setSelection([]);
    setEditing(null);
    drag.current = { kind: 'box', sx: event.clientX, sy: event.clientY, add: keep ? selection : [], moved: false };
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dxPx = event.clientX - d.sx;
      const dyPx = event.clientY - d.sy;
      if (!d.moved) {
        if (dxPx * dxPx + dyPx * dyPx < 9) return; // a click, not a drag
        d.moved = true;
        if (d.kind === 'el') record();
      }
      if (d.kind === 'box') {
        const a = toMm(d.sx, d.sy);
        const b = toMm(event.clientX, event.clientY);
        const box = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
        setMarquee(box);
        const hit = itemsRef.current.filter((e) => overlaps(box, sampleVisualBox(e))).map((e) => e.id);
        setSelection([...new Set([...d.add, ...hit])]);
        return;
      }
      if (d.mode === 'move' && d.starts.length > 1) {
        // A group moves together and snaps by its outline.
        let mx = dxPxToMm(dxPx);
        let my = dxPxToMm(dyPx);
        const nextGuides: Guide[] = [];
        if (!event.altKey) {
          const b0 = boundsOf(d.starts);
          const b = { ...b0, left: b0.left + mx, top: b0.top + my };
          const ids = d.starts.map((e) => e.id);
          const sx = snapAxis([b.left, b.left + b.width / 2, b.left + b.width], 'x', ids);
          if (sx) { mx += sx.shift; nextGuides.push({ axis: 'x', at: sx.at }); }
          const sy = snapAxis([b.top, b.top + b.height / 2, b.top + b.height], 'y', ids);
          if (sy) { my += sy.shift; nextGuides.push({ axis: 'y', at: sy.at }); }
        }
        setGuides(nextGuides);
        const moved = new Map(d.starts.map((e) => [e.id, { left: round(e.left + mx), top: round(e.top + my) }]));
        setHud(`${d.starts.length} elements  ·  moved ${round(mx)}, ${round(my)} mm`);
        setItems((cur) => cur.map((e) => (moved.has(e.id) ? { ...e, ...moved.get(e.id) } : e)));
        setDirty(true);
        return;
      }
      const dx = dxPx / scale;
      const dy = dyPx / scale;
      const s = d.start;
      const self = [s.id];
      const nextGuides: Guide[] = [];
      let patch: Partial<SampleElement>;
      if (d.mode === 'move') {
        let left = s.left + dx;
        let top = s.top + dy;
        if (!event.altKey) {
          // Snap what is seen: a turned element covers its box with width and height swapped.
          const b = sampleVisualBox({ ...s, left, top });
          const sx = snapAxis([b.left, b.left + b.width / 2, b.left + b.width], 'x', self);
          if (sx) { left += sx.shift; nextGuides.push({ axis: 'x', at: sx.at }); }
          const sy = snapAxis([b.top, b.top + b.height / 2, b.top + b.height], 'y', self);
          if (sy) { top += sy.shift; nextGuides.push({ axis: 'y', at: sy.at }); }
        }
        patch = { left: round(left), top: round(top) };
        setHud(`X ${round(left)}  ·  Y ${round(top)} mm`);
      } else if (s.rotation) {
        // A turned element: the handle drags along its own axis, and the edge opposite the handle stays put.
        const a = (s.rotation * Math.PI) / 180;
        const [cos, sin] = [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
        const min = s.type === 'qrcode' ? MIN_SQUARE_MM : MIN_MM;
        const grown = d.mode === 'e'
          ? { width: Math.max(min, s.width + dx * cos + dy * sin) }
          : s.type === 'qrcode'
            ? { width: Math.max(min, s.height - dx * sin + dy * cos) }
            : { height: Math.max(min, s.height - dx * sin + dy * cos) };
        const f = fit({ ...s, ...grown });
        const dw = f.width - s.width;
        const dh = f.height - s.height;
        const cx = s.left + s.width / 2 + (cos * dw - sin * dh) / 2;
        const cy = s.top + s.height / 2 + (sin * dw + cos * dh) / 2;
        patch = { ...grown, width: round(f.width), height: round(f.height), left: round(cx - f.width / 2), top: round(cy - f.height / 2) };
      } else if (d.mode === 'e') {
        let width = s.width + dx;
        if (!event.altKey) {
          const sx = snapAxis([s.left + width], 'x', self);
          if (sx) { width += sx.shift; nextGuides.push({ axis: 'x', at: sx.at }); }
        }
        width = Math.max(s.type === 'qrcode' ? MIN_SQUARE_MM : MIN_MM, width);
        patch = { width: round(width) };
      } else {
        let height = s.height + dy;
        if (!event.altKey) {
          const sy = snapAxis([s.top + height], 'y', self);
          if (sy) { height += sy.shift; nextGuides.push({ axis: 'y', at: sy.at }); }
        }
        height = Math.max(s.type === 'qrcode' ? MIN_SQUARE_MM : MIN_MM, height);
        patch = s.type === 'qrcode' ? { width: round(height) } : { height: round(height) };
      }
      setGuides(nextGuides);
      const base = itemsRef.current.find((e) => e.id === d.id);
      if (!base) return;
      const next = fit({ ...base, ...patch });
      if (d.mode !== 'move') setHud(`${round(next.width)} × ${round(next.height)} mm`);
      setItems((cur) => cur.map((e) => (e.id === d.id ? next : e)));
      setDirty(true);
    }
    function onUp() {
      const d = drag.current;
      // A click (no drag) on one member of a group narrows the selection to it.
      if (d?.kind === 'el' && !d.moved && d.starts.length > 1) setSelection([d.id]);
      drag.current = null;
      setGuides([]);
      setHud(null);
      setMarquee(null);
    }
    function dxPxToMm(v: number) { return v / scale; }
    /** The label point under the pointer, in mm. */
    function toMm(clientX: number, clientY: number) {
      const r = stage.current?.getBoundingClientRect();
      return r ? { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale } : { x: 0, y: 0 };
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [scale, snapAxis, record]);

  // Keyboard, as on a desktop design tool: arrows nudge (Shift = 2 mm), Delete, R turns,
  // Ctrl/Cmd + A, C, X, V, D, Z, Y. Everything acts on the whole selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') { setEditing(null); setSelection([]); return; }
      const key = e.key.toLowerCase();
      if (mod && key === 'a') { e.preventDefault(); setSelection(itemsRef.current.map((i) => i.id)); return; }
      if (mod && key === 'v') { e.preventDefault(); paste(); return; }
      const els = itemsRef.current.filter((i) => selection.includes(i.id));
      if (!els.length) return;
      const ids = els.map((i) => i.id);
      if (mod && key === 'c') { e.preventDefault(); copy(els); return; }
      if (mod && key === 'x') { e.preventDefault(); copy(els, true); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicate(els); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(ids); return; }
      if (e.key === 'Enter' && els.length === 1 && els[0].type !== 'line') { e.preventDefault(); setEditing(els[0].id); return; }
      if (!mod && key === 'r') { e.preventDefault(); changeMany(ids, (el) => ({ rotation: turned(el, e.shiftKey ? 270 : 90) })); return; }
      const step = e.shiftKey ? 2 : NUDGE_MM;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = moves[e.key];
      if (m) { e.preventDefault(); changeMany(ids, (el) => ({ left: round(el.left + m[0]), top: round(el.top + m[1]) }), 'nudge'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function save(layout: SampleElement[]): Promise<boolean> {
    setBusy(true);
    try {
      await api(`/api/library/template/items/${template.id}/sample`, { method: 'PUT', body: JSON.stringify({ layout }) });
      toast(layout.length ? 'Sample content saved. The app shows it under “With sample data”' : 'Sample content cleared');
      setDirty(false);
      setSavedAt(Date.now());
      onSaved(layout);
      return true;
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); return false; }
    finally { setBusy(false); }
  }

  function applyJson() {
    try {
      const parsed: unknown = JSON.parse(json ?? '[]');
      if (!Array.isArray(parsed)) throw new Error('Must be a list');
      record();
      setItems(parsed.map((e, i) => fit({ ...(e as SampleElement), id: (e as SampleElement).id || newId() + i })));
      setSelection([]);
      setDirty(true);
      setJson(null);
    } catch { toast('That is not a valid list of elements', 'bad'); }
  }

  const close = () => (!dirty || window.confirm('Discard unsaved changes?')) && onClose();
  const svgSrc = useMemo(() => stretchedSvg(template.svgCode), [template.svgCode]);
  const editingEl = items.find((e) => e.id === editing) ?? null;
  const editingBox = editingEl ? sampleVisualBox(editingEl) : null;
  // Align what is seen: a turned element covers its box with width and height swapped.
  const seen = current ? sampleVisualBox(current) : null;
  const alignX = (to: (w: number) => number) => current && seen && change(current.id, { left: round(to(seen.width) - (seen.left - current.left)) });
  const alignY = (to: (h: number) => number) => current && seen && change(current.id, { top: round(to(seen.height) - (seen.top - current.top)) });

  return (
    <>
      <button className="drawer-back designer-back" aria-label="Close" onClick={close} />
      <div className="designer sd" role="dialog" aria-modal="true" aria-label={`Design sample for ${template.name}`}>
        <div className="designer-head">
          <div>
            <h2>Design sample · {template.name}</h2>
            <p>{round(W)} × {round(H)} mm. Drag to move, pull the round handles to resize, double-click to change the text, R to turn. Shift-click or drag a box to pick several; Ctrl/⌘ + C / V to copy and paste. Hold Alt to drag without snapping.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="designer-body">
          <div className="sd-canvas-wrap">
          <div className="sd-canvas" ref={wrap} onPointerDown={beginBox}>
            <div className="sd-board" style={{ width: px(W) + RULER + PAD * 2, height: px(H) + RULER + PAD * 2 }}>
              <div className="sd-frame" style={{ left: PAD, top: PAD }}>
                <span className="sd-corner" />
                <div className="sd-ruler-top" style={{ left: RULER }}><Ruler axis="x" lengthMm={W} scale={scale} band={currentBox ? [currentBox.left, currentBox.left + currentBox.width] : null} /></div>
                <div className="sd-ruler-left" style={{ top: RULER }}><Ruler axis="y" lengthMm={H} scale={scale} band={currentBox ? [currentBox.top, currentBox.top + currentBox.height] : null} /></div>
                <div className="sd-stage" ref={stage} style={{ left: RULER, top: RULER, width: px(W), height: px(H) }}>
                  <img className="sd-template" src={svgSrc} alt="" draggable={false} />
                  {items.map((el) => {
                    const on = selection.includes(el.id);
                    const handles = el.id === selected;
                    const thin = el.type === 'line' && px(el.height) < 14;
                    return (
                      <div key={el.id} className={`sd-el ${el.type}${on ? ' on' : ''}`}
                        style={{ left: px(el.left), top: px(el.top), width: px(el.width), height: Math.max(1, px(el.height)), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
                        onPointerDown={(e) => begin(e, el, 'move')}
                        onDoubleClick={(e) => { e.stopPropagation(); if (el.type !== 'line') setEditing(el.id); }}>
                        <ElementView el={el} scale={scale} />
                        {thin ? <span className="sd-hit" /> : null}
                        {on ? <span className="sd-outline" style={{ borderColor: SELECTION }} /> : null}
                        {handles ? HANDLES[el.type].map((h) => (
                          <span key={h} className={`sd-handle ${h}`} style={{ background: HANDLE, width: HANDLE_PX, height: HANDLE_PX }}
                            title={h === 'e' ? (el.type === 'qrcode' ? 'Resize' : el.type === 'line' ? 'Length' : 'Width') : el.type === 'qrcode' ? 'Resize' : 'Height'}
                            onPointerDown={(e) => begin(e, el, h)}><HandleIcon mode={h} /></span>
                        )) : null}
                      </div>
                    );
                  })}
                  {group.length > 1 && currentBox ? (
                    <span className="sd-group" style={{ left: px(currentBox.left) - 4, top: px(currentBox.top) - 4, width: px(currentBox.width) + 8, height: px(currentBox.height) + 8 }} />
                  ) : null}
                  {marquee ? (
                    <span className="sd-marquee" style={{ left: px(marquee.left), top: px(marquee.top), width: px(marquee.width), height: px(marquee.height) }} />
                  ) : null}
                  {guides.map((g, i) => (
                    <span key={i} className="sd-guide" style={g.axis === 'x'
                      ? { left: px(g.at), top: -RULER, bottom: 0, width: 1, background: GUIDE }
                      : { top: px(g.at), left: -RULER, right: 0, height: 1, background: GUIDE }} />
                  ))}
                  {hud && currentBox ? (
                    <span className="sd-hud" style={{ left: px(currentBox.left + currentBox.width / 2), top: px(currentBox.top + currentBox.height) + 22 }}>{hud}</span>
                  ) : null}
                  {editingEl && editingBox ? (
                    <div className="sd-quick" style={{ left: Math.min(px(editingBox.left), px(W) - 260), top: px(editingBox.top + editingBox.height) + 10 }}
                      onPointerDown={(e) => e.stopPropagation()}>
                      <b>{editingEl.type === 'text' ? 'Text' : editingEl.type === 'barcode' ? 'Barcode value' : 'QR content'}</b>
                      {editingEl.type === 'text' ? (
                        <textarea autoFocus rows={3} value={editingEl.text ?? ''} onChange={(e) => change(editingEl.id, { text: e.target.value }, 'text')}
                          onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) setEditing(null); }} />
                      ) : (
                        <input autoFocus value={editingEl.text ?? ''} onChange={(e) => change(editingEl.id, { text: e.target.value }, 'text')}
                          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setEditing(null); }} />
                      )}
                      <div className="sd-quick-foot">
                        <small>{editingEl.type === 'text' ? 'Ctrl/⌘ + Enter to finish' : 'Enter to finish'}</small>
                        <button className="btn small primary" onClick={() => setEditing(null)}>Done</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
            <div className="sd-zoom">
              <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.25, round(z / 1.25)))} aria-label="Zoom out" title="Zoom out"><Minus size={14} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button className="icon-btn" onClick={() => setZoom((z) => Math.min(8, round(z * 1.25)))} aria-label="Zoom in" title="Zoom in"><Plus size={14} /></button>
              <button className="icon-btn" onClick={() => setZoom(1)} aria-label="Fit" title="Fit"><Maximize size={14} /></button>
            </div>
          </div>

          <aside className="designer-side sd-side">
            <div className="sd-suggest">
              <div className="seg" role="group" aria-label="Use case">
                {USE_CASES.map((u) => <button key={u.id} type="button" className={useCase === u.id ? 'on' : ''} onClick={() => { setUseCase(u.id); variant.current = 0; }}>{u.name}</button>)}
              </div>
              <button type="button" className="btn small" onClick={suggest}><Sparkles size={13} /> Suggest design</button>
            </div>
            <div className="sd-tools">
              {(['text', 'barcode', 'qrcode', 'line'] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                return <button key={t} className="sd-tool" onClick={() => add(t)}><Icon size={20} /><span>{TYPE_NAME[t]}</span></button>;
              })}
            </div>

            {current ? (
              <div className="sd-panel">
                <div className="sd-panel-head">
                  <h3>{TYPE_NAME[current.type]}</h3>
                  <div className="sd-row">
                    <button className="icon-btn" onClick={() => copy([current])} title="Copy (Ctrl/⌘ + C)" aria-label="Copy"><Clipboard size={14} /></button>
                    <button className="icon-btn" onClick={paste} title="Paste (Ctrl/⌘ + V)" aria-label="Paste"><ClipboardPaste size={14} /></button>
                    <button className="icon-btn" onClick={() => duplicate([current])} title="Duplicate (Ctrl/⌘ + D)" aria-label="Duplicate"><Copy size={14} /></button>
                    <button className="icon-btn" onClick={() => remove([current.id])} title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>

                {current.type === 'text' ? (
                  <section>
                    <label className="sd-field">Content<textarea rows={3} value={current.text ?? ''} onChange={(e) => change(current.id, { text: e.target.value }, 'text')} /></label>
                    <div className="sd-field">
                      <span>Font size</span>
                      <div className="sd-font">
                        <button className="icon-btn" onClick={() => change(current.id, { fontSize: Math.max(3, round((current.fontSize ?? TEXT_PT) - 0.5)) }, 'font')} aria-label="Smaller"><Minus size={13} /></button>
                        <input type="range" min={3} max={48} step={0.5} value={current.fontSize ?? TEXT_PT} onChange={(e) => change(current.id, { fontSize: Number(e.target.value) }, 'font')} />
                        <button className="icon-btn" onClick={() => change(current.id, { fontSize: Math.min(120, round((current.fontSize ?? TEXT_PT) + 0.5)) }, 'font')} aria-label="Bigger"><Plus size={13} /></button>
                        <b>{current.fontSize ?? TEXT_PT} pt</b>
                      </div>
                    </div>
                    <div className="sd-row">
                      <div className="seg" role="group" aria-label="Alignment">
                        {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                          <button key={a} type="button" className={(current.align ?? 'left') === a ? 'on' : ''} onClick={() => change(current.id, { align: a })} aria-label={`Align ${a}`} title={`Align ${a}`}><Icon size={14} /></button>
                        ))}
                      </div>
                      <div className="seg" role="group" aria-label="Style">
                        <button type="button" className={current.bold ? 'on' : ''} onClick={() => change(current.id, { bold: !current.bold })} aria-label="Bold" title="Bold"><b>B</b></button>
                      </div>
                    </div>
                  </section>
                ) : null}

                {current.type === 'barcode' || current.type === 'qrcode' ? (
                  <section>
                    <label className="sd-field">{current.type === 'barcode' ? 'Barcode value (CODE-128)' : 'QR content'}
                      <input value={current.text ?? ''} onChange={(e) => change(current.id, { text: e.target.value }, 'text')} />
                    </label>
                    {current.type === 'barcode' && !barcodeBars(current.text || '0123456789', current.width) ? <p className="sd-warn">CODE-128 cannot encode this. Use plain letters and digits.</p> : null}
                    {current.type === 'qrcode' && !qrModules(current.text || 'x') ? <p className="sd-warn">Too long for a QR code.</p> : null}
                    {current.type === 'barcode' ? <p className="u-muted sd-note">Digits under the bars are {barcodeFontPt(current.height)} pt, set by the height, as in the app.</p> : null}
                  </section>
                ) : null}

                <section>
                  <h4>Position</h4>
                  <div className="sd-grid">
                    <NumberField label="X" value={current.left} onChange={(v) => change(current.id, { left: v }, 'x')} />
                    <NumberField label="Y" value={current.top} onChange={(v) => change(current.id, { top: v }, 'y')} />
                    <NumberField label="W" value={current.width} onChange={(v) => change(current.id, { width: Math.max(current.type === 'qrcode' ? MIN_SQUARE_MM : MIN_MM, v) }, 'w')} />
                    <NumberField label={current.type === 'line' ? 'Thick' : 'H'} value={current.height} disabled={current.type === 'text' || current.type === 'qrcode'}
                      onChange={(v) => change(current.id, { height: Math.max(current.type === 'line' ? 0.1 : MIN_MM, v) }, 'h')} />
                  </div>
                  <div className="sd-row sd-nudge">
                    <div className="seg" role="group" aria-label="Nudge">
                      <button type="button" onClick={() => change(current.id, { left: round(current.left - NUDGE_MM) }, 'nudge')} aria-label="Left"><ArrowLeft size={14} /></button>
                      <button type="button" onClick={() => change(current.id, { top: round(current.top - NUDGE_MM) }, 'nudge')} aria-label="Up"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => change(current.id, { top: round(current.top + NUDGE_MM) }, 'nudge')} aria-label="Down"><ArrowDown size={14} /></button>
                      <button type="button" onClick={() => change(current.id, { left: round(current.left + NUDGE_MM) }, 'nudge')} aria-label="Right"><ArrowRight size={14} /></button>
                    </div>
                    <span className="u-muted">{NUDGE_MM} mm</span>
                  </div>
                  <div className="sd-align" role="group" aria-label="Align on the label">
                    <button className="icon-btn" title="Left edge" onClick={() => alignX(() => 0)}><AlignStartVertical size={15} /></button>
                    <button className="icon-btn" title="Centre across" onClick={() => alignX((w) => (W - w) / 2)}><AlignCenterVertical size={15} /></button>
                    <button className="icon-btn" title="Right edge" onClick={() => alignX((w) => W - w)}><AlignEndVertical size={15} /></button>
                    <button className="icon-btn" title="Top edge" onClick={() => alignY(() => 0)}><AlignStartHorizontal size={15} /></button>
                    <button className="icon-btn" title="Centre down" onClick={() => alignY((h) => (H - h) / 2)}><AlignCenterHorizontal size={15} /></button>
                    <button className="icon-btn" title="Bottom edge" onClick={() => alignY((h) => H - h)}><AlignEndHorizontal size={15} /></button>
                    <button className="icon-btn" title="Bring to front" onClick={() => reorder(current.id, true)}><BringToFront size={15} /></button>
                    <button className="icon-btn" title="Send to back" onClick={() => reorder(current.id, false)}><SendToBack size={15} /></button>
                  </div>
                </section>

                <section>
                  <h4>Rotation</h4>
                  <div className="sd-row sd-rotate">
                    <div className="seg" role="group" aria-label="Turn">
                      <button type="button" onClick={() => change(current.id, { rotation: turned(current, 270) })} title="Turn left 90° (Shift + R)" aria-label="Turn left 90°"><RotateCcw size={14} /></button>
                      <button type="button" onClick={() => change(current.id, { rotation: turned(current, 90) })} title="Turn right 90° (R)" aria-label="Turn right 90°"><RotateCw size={14} /></button>
                    </div>
                    <div className="seg" role="group" aria-label="Angle">
                      {ANGLES.map((a) => (
                        <button key={a} type="button" className={(current.rotation ?? 0) === a ? 'on' : ''} onClick={() => change(current.id, { rotation: a })} title={a ? `Turned ${a}°` : 'Upright'}>{a}°</button>
                      ))}
                    </div>
                  </div>
                  <p className="u-muted sd-note">Turns about its centre, in quarter turns as in the app. R turns right, Shift + R left.</p>
                </section>
              </div>
            ) : group.length > 1 && currentBox ? (
              <div className="sd-panel">
                <div className="sd-panel-head">
                  <h3>{group.length} elements</h3>
                  <div className="sd-row">
                    <button className="icon-btn" onClick={() => copy(group)} title="Copy (Ctrl/⌘ + C)" aria-label="Copy"><Clipboard size={14} /></button>
                    <button className="icon-btn" onClick={paste} title="Paste (Ctrl/⌘ + V)" aria-label="Paste"><ClipboardPaste size={14} /></button>
                    <button className="icon-btn" onClick={() => duplicate(group)} title="Duplicate (Ctrl/⌘ + D)" aria-label="Duplicate"><Copy size={14} /></button>
                    <button className="icon-btn" onClick={() => remove(selection)} title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
                <section>
                  <h4>Move together</h4>
                  <div className="sd-row sd-nudge">
                    <div className="seg" role="group" aria-label="Nudge">
                      {([[ArrowLeft, -NUDGE_MM, 0], [ArrowUp, 0, -NUDGE_MM], [ArrowDown, 0, NUDGE_MM], [ArrowRight, NUDGE_MM, 0]] as const).map(([Icon, mx, my], i) => (
                        <button key={i} type="button" onClick={() => changeMany(selection, (e) => ({ left: round(e.left + mx), top: round(e.top + my) }), 'nudge')}><Icon size={14} /></button>
                      ))}
                    </div>
                    <span className="u-muted">{round(currentBox.width)} × {round(currentBox.height)} mm</span>
                  </div>
                  <p className="u-muted sd-note">On the label, as one block:</p>
                  <div className="sd-align" role="group" aria-label="Align the group on the label">
                    <button className="icon-btn" title="Left edge" onClick={() => changeMany(selection, (e) => ({ left: round(e.left - currentBox.left) }))}><AlignStartVertical size={15} /></button>
                    <button className="icon-btn" title="Centre across" onClick={() => changeMany(selection, (e) => ({ left: round(e.left + (W - currentBox.width) / 2 - currentBox.left) }))}><AlignCenterVertical size={15} /></button>
                    <button className="icon-btn" title="Right edge" onClick={() => changeMany(selection, (e) => ({ left: round(e.left + W - currentBox.width - currentBox.left) }))}><AlignEndVertical size={15} /></button>
                    <button className="icon-btn" title="Top edge" onClick={() => changeMany(selection, (e) => ({ top: round(e.top - currentBox.top) }))}><AlignStartHorizontal size={15} /></button>
                    <button className="icon-btn" title="Centre down" onClick={() => changeMany(selection, (e) => ({ top: round(e.top + (H - currentBox.height) / 2 - currentBox.top) }))}><AlignCenterHorizontal size={15} /></button>
                    <button className="icon-btn" title="Bottom edge" onClick={() => changeMany(selection, (e) => ({ top: round(e.top + H - currentBox.height - currentBox.top) }))}><AlignEndHorizontal size={15} /></button>
                  </div>
                  <p className="u-muted sd-note">To each other, inside the selection:</p>
                  <div className="sd-align" role="group" aria-label="Align the elements to each other">
                    {([
                      ['Left edges', AlignStartVertical, (b: Box) => ({ dx: currentBox.left - b.left, dy: 0 })],
                      ['Centres across', AlignCenterVertical, (b: Box) => ({ dx: currentBox.left + currentBox.width / 2 - (b.left + b.width / 2), dy: 0 })],
                      ['Right edges', AlignEndVertical, (b: Box) => ({ dx: currentBox.left + currentBox.width - (b.left + b.width), dy: 0 })],
                      ['Top edges', AlignStartHorizontal, (b: Box) => ({ dx: 0, dy: currentBox.top - b.top })],
                      ['Centres down', AlignCenterHorizontal, (b: Box) => ({ dx: 0, dy: currentBox.top + currentBox.height / 2 - (b.top + b.height / 2) })],
                      ['Bottom edges', AlignEndHorizontal, (b: Box) => ({ dx: 0, dy: currentBox.top + currentBox.height - (b.top + b.height) })],
                    ] as const).map(([title, Icon, shift]) => (
                      <button key={title} className="icon-btn" title={title} onClick={() => changeMany(selection, (e) => { const d = shift(sampleVisualBox(e)); return { left: round(e.left + d.dx), top: round(e.top + d.dy) }; })}><Icon size={15} /></button>
                    ))}
                  </div>
                </section>
                <section>
                  <h4>Rotation</h4>
                  <div className="sd-row sd-rotate">
                    <div className="seg" role="group" aria-label="Turn each">
                      <button type="button" onClick={() => changeMany(selection, (e) => ({ rotation: turned(e, 270) }))} title="Turn each left 90° (Shift + R)" aria-label="Turn each left 90°"><RotateCcw size={14} /></button>
                      <button type="button" onClick={() => changeMany(selection, (e) => ({ rotation: turned(e, 90) }))} title="Turn each right 90° (R)" aria-label="Turn each right 90°"><RotateCw size={14} /></button>
                    </div>
                    <div className="seg" role="group" aria-label="Angle">
                      {ANGLES.map((a) => (
                        <button key={a} type="button" className={group.every((e) => (e.rotation ?? 0) === a) ? 'on' : ''} onClick={() => changeMany(selection, () => ({ rotation: a }))}>{a}°</button>
                      ))}
                    </div>
                  </div>
                  <p className="u-muted sd-note">Each element turns about its own centre.</p>
                </section>
              </div>
            ) : (
              <p className="u-muted designer-hint">{items.length
                ? 'Click an element to edit it. Shift or Ctrl/⌘-click, or drag a box on empty space, to pick several. Ctrl/⌘ + A picks all.'
                : 'Add a text, barcode, QR code or line to start.'}</p>
            )}

            {items.length ? (
              <section className="sd-layers">
                <h4>Elements <small className="u-muted">Shift or Ctrl/⌘ to pick several</small></h4>
                {[...items].reverse().map((el) => {
                  const Icon = TYPE_ICON[el.type];
                  return (
                    <button key={el.id} className={selection.includes(el.id) ? 'sd-layer on' : 'sd-layer'} onClick={(e) => pick(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}>
                      <Icon size={14} /><span>{el.type === 'line' ? `Line ${round(el.width)} mm` : el.text || TYPE_NAME[el.type]}</span>
                    </button>
                  );
                })}
              </section>
            ) : null}

            <details className="designer-json" open={json !== null} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && json === null) setJson(JSON.stringify(items, null, 1)); }}>
              <summary>Advanced: edit as JSON</summary>
              {json !== null ? (
                <>
                  <textarea rows={8} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
                  <button className="btn small" onClick={applyJson}>Apply JSON</button>
                </>
              ) : null}
            </details>
          </aside>
        </div>

        <div className="designer-foot">
          <button className="icon-btn" onClick={undo} disabled={!past.current.length} title="Undo (Ctrl/⌘ + Z)" aria-label="Undo"><Undo2 size={15} /></button>
          <button className="icon-btn" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl/⌘ + Shift + Z)" aria-label="Redo"><Redo2 size={15} /></button>
          <span className="u-muted">{items.length} element{items.length === 1 ? '' : 's'}{dirty ? ' · unsaved changes' : savedAt ? ' · saved' : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="btn danger" disabled={busy || (items.length === 0 && initial.length === 0)} onClick={() => window.confirm('Remove all sample content from this template?') && void save([])}>Clear sample</button>
          <button className="btn" disabled={busy || !dirty} onClick={() => void save(items)}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn primary" disabled={busy} onClick={() => { if (!dirty) return onClose(); void save(items).then((ok) => { if (ok) onClose(); }); }}>{dirty ? 'Save and close' : 'Done'}</button>
        </div>
      </div>
    </>
  );
}
