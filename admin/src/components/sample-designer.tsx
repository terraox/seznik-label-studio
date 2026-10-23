'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter, AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BringToFront, Copy, Maximize,
  Minus, Plus, QrCode, Redo2, ScanBarcode, SendToBack, Trash2, Type, Undo2, X,
} from 'lucide-react';

import { useToast } from '@/components/desk';
import { api } from '@/lib/client';
import {
  APP_FONT, INK, INK_BLACK, PT_MM, barcodeBars, barcodeFontPt, qrModules, textHeightMm, textLineMm, textPadXMm, textPadYMm,
} from '@/lib/sample-render';
import type { SampleElement, SampleElementType } from '@/lib/sample-layout';

type Template = { id: string; name: string; widthMm: number | null; heightMm: number | null; svgCode: string; sampleLayout?: unknown };
type Mode = 'move' | 'e' | 's';
type Drag = { id: string; mode: Mode; sx: number; sy: number; start: SampleElement; moved: boolean };
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

const TYPE_NAME: Record<SampleElementType, string> = { text: 'Text', barcode: 'Barcode', qrcode: 'QR code', line: 'Line' };
const TYPE_ICON: Record<SampleElementType, typeof Type> = { text: Type, barcode: ScanBarcode, qrcode: QrCode, line: Minus };
/** Which edge handles each type gets in the app, and what they change. */
const HANDLES: Record<SampleElementType, ('e' | 's')[]> = { text: ['e'], line: ['e'], barcode: ['e', 's'], qrcode: ['e', 's'] };

const round = (n: number) => Math.round(n * 100) / 100;
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
            <div key={el.id} className={`sd-pv-el ${el.type}`} style={{ left: el.left * scale, top: el.top * scale, width: el.width * scale, height: Math.max(1, el.height * scale) }}>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hud, setHud] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
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
  const current = items.find((e) => e.id === selected) ?? null;

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
    setSelected(el.id);
    setDirty(true);
  }
  function remove(id: string) {
    record();
    setItems((cur) => cur.filter((e) => e.id !== id));
    setSelected(null);
    setEditing(null);
    setDirty(true);
  }
  function duplicate(el: SampleElement) {
    record();
    const copy = { ...el, id: newId(), left: round(el.left + 2), top: round(el.top + 2) };
    setItems((cur) => [...cur, copy]);
    setSelected(copy.id);
    setDirty(true);
  }
  function reorder(id: string, toFront: boolean) {
    record();
    setItems((cur) => { const el = cur.find((e) => e.id === id); if (!el) return cur; const rest = cur.filter((e) => e.id !== id); return toFront ? [...rest, el] : [el, ...rest]; });
    setDirty(true);
  }

  /** Snaps a moving edge set to the label's edges and centre and to the other elements. Returns the shift and the guide. */
  const snapAxis = useCallback((edges: number[], axis: 'x' | 'y', skip: string) => {
    const limit = axis === 'x' ? W : H;
    const targets = [0, limit / 2, limit];
    for (const o of itemsRef.current) {
      if (o.id === skip) continue;
      const a = axis === 'x' ? o.left : o.top;
      const s = axis === 'x' ? o.width : o.height;
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
    setSelected(el.id);
    if (editing && editing !== el.id) setEditing(null);
    drag.current = { id: el.id, mode, sx: event.clientX, sy: event.clientY, start: { ...el }, moved: false };
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
        record();
      }
      const dx = dxPx / scale;
      const dy = dyPx / scale;
      const s = d.start;
      const nextGuides: Guide[] = [];
      let patch: Partial<SampleElement>;
      if (d.mode === 'move') {
        let left = s.left + dx;
        let top = s.top + dy;
        if (!event.altKey) {
          const sx = snapAxis([left, left + s.width / 2, left + s.width], 'x', s.id);
          if (sx) { left += sx.shift; nextGuides.push({ axis: 'x', at: sx.at }); }
          const sy = snapAxis([top, top + s.height / 2, top + s.height], 'y', s.id);
          if (sy) { top += sy.shift; nextGuides.push({ axis: 'y', at: sy.at }); }
        }
        patch = { left: round(left), top: round(top) };
        setHud(`X ${round(left)}  ·  Y ${round(top)} mm`);
      } else if (d.mode === 'e') {
        let width = s.width + dx;
        if (!event.altKey) {
          const sx = snapAxis([s.left + width], 'x', s.id);
          if (sx) { width += sx.shift; nextGuides.push({ axis: 'x', at: sx.at }); }
        }
        width = Math.max(s.type === 'qrcode' ? MIN_SQUARE_MM : MIN_MM, width);
        patch = { width: round(width) };
      } else {
        let height = s.height + dy;
        if (!event.altKey) {
          const sy = snapAxis([s.top + height], 'y', s.id);
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
      drag.current = null;
      setGuides([]);
      setHud(null);
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

  // Keyboard, as on a desktop design tool: arrows nudge (Shift = 2 mm), Delete, Ctrl/Cmd + D, Z, Y.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') { setEditing(null); setSelected(null); return; }
      const el = itemsRef.current.find((i) => i.id === selected);
      if (!el) return;
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(el); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(el.id); return; }
      if (e.key === 'Enter' && el.type !== 'line') { e.preventDefault(); setEditing(el.id); return; }
      const step = e.shiftKey ? 2 : NUDGE_MM;
      const moves: Record<string, Partial<SampleElement>> = {
        ArrowLeft: { left: round(el.left - step) }, ArrowRight: { left: round(el.left + step) },
        ArrowUp: { top: round(el.top - step) }, ArrowDown: { top: round(el.top + step) },
      };
      if (moves[e.key]) { e.preventDefault(); change(el.id, moves[e.key], 'nudge'); }
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
      setSelected(null);
      setDirty(true);
      setJson(null);
    } catch { toast('That is not a valid list of elements', 'bad'); }
  }

  const close = () => (!dirty || window.confirm('Discard unsaved changes?')) && onClose();
  const svgSrc = useMemo(() => stretchedSvg(template.svgCode), [template.svgCode]);
  const editingEl = items.find((e) => e.id === editing) ?? null;
  const align = (patch: Partial<SampleElement>) => current && change(current.id, patch);

  return (
    <>
      <button className="drawer-back designer-back" aria-label="Close" onClick={close} />
      <div className="designer sd" role="dialog" aria-modal="true" aria-label={`Design sample for ${template.name}`}>
        <div className="designer-head">
          <div>
            <h2>Design sample · {template.name}</h2>
            <p>{round(W)} × {round(H)} mm. Drag to move, pull the round handles to resize, double-click to change the text. Hold Alt to drag without snapping.</p>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="designer-body">
          <div className="sd-canvas-wrap">
          <div className="sd-canvas" ref={wrap} onPointerDown={() => { setSelected(null); setEditing(null); }}>
            <div className="sd-board" style={{ width: px(W) + RULER + PAD * 2, height: px(H) + RULER + PAD * 2 }}>
              <div className="sd-frame" style={{ left: PAD, top: PAD }}>
                <span className="sd-corner" />
                <div className="sd-ruler-top" style={{ left: RULER }}><Ruler axis="x" lengthMm={W} scale={scale} band={current ? [current.left, current.left + current.width] : null} /></div>
                <div className="sd-ruler-left" style={{ top: RULER }}><Ruler axis="y" lengthMm={H} scale={scale} band={current ? [current.top, current.top + current.height] : null} /></div>
                <div className="sd-stage" style={{ left: RULER, top: RULER, width: px(W), height: px(H) }}>
                  <img className="sd-template" src={svgSrc} alt="" draggable={false} />
                  {items.map((el) => {
                    const on = el.id === selected;
                    const thin = el.type === 'line' && px(el.height) < 14;
                    return (
                      <div key={el.id} className={`sd-el ${el.type}${on ? ' on' : ''}`}
                        style={{ left: px(el.left), top: px(el.top), width: px(el.width), height: Math.max(1, px(el.height)) }}
                        onPointerDown={(e) => begin(e, el, 'move')}
                        onDoubleClick={(e) => { e.stopPropagation(); if (el.type !== 'line') setEditing(el.id); }}>
                        <ElementView el={el} scale={scale} />
                        {thin ? <span className="sd-hit" /> : null}
                        {on ? <span className="sd-outline" style={{ borderColor: SELECTION }} /> : null}
                        {on ? HANDLES[el.type].map((h) => (
                          <span key={h} className={`sd-handle ${h}`} style={{ background: HANDLE, width: HANDLE_PX, height: HANDLE_PX }}
                            title={h === 'e' ? (el.type === 'qrcode' ? 'Resize' : el.type === 'line' ? 'Length' : 'Width') : el.type === 'qrcode' ? 'Resize' : 'Height'}
                            onPointerDown={(e) => begin(e, el, h)}><HandleIcon mode={h} /></span>
                        )) : null}
                      </div>
                    );
                  })}
                  {guides.map((g, i) => (
                    <span key={i} className="sd-guide" style={g.axis === 'x'
                      ? { left: px(g.at), top: -RULER, bottom: 0, width: 1, background: GUIDE }
                      : { top: px(g.at), left: -RULER, right: 0, height: 1, background: GUIDE }} />
                  ))}
                  {hud && current ? (
                    <span className="sd-hud" style={{ left: px(current.left + current.width / 2), top: px(current.top + current.height) + 22 }}>{hud}</span>
                  ) : null}
                  {editingEl ? (
                    <div className="sd-quick" style={{ left: Math.min(px(editingEl.left), px(W) - 260), top: px(editingEl.top + editingEl.height) + 10 }}
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
                    <button className="icon-btn" onClick={() => duplicate(current)} title="Duplicate (Ctrl/⌘ + D)" aria-label="Duplicate"><Copy size={14} /></button>
                    <button className="icon-btn" onClick={() => remove(current.id)} title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
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
                    <button className="icon-btn" title="Left edge" onClick={() => align({ left: 0 })}><AlignStartVertical size={15} /></button>
                    <button className="icon-btn" title="Centre across" onClick={() => align({ left: round((W - current.width) / 2) })}><AlignCenterVertical size={15} /></button>
                    <button className="icon-btn" title="Right edge" onClick={() => align({ left: round(W - current.width) })}><AlignEndVertical size={15} /></button>
                    <button className="icon-btn" title="Top edge" onClick={() => align({ top: 0 })}><AlignStartHorizontal size={15} /></button>
                    <button className="icon-btn" title="Centre down" onClick={() => align({ top: round((H - current.height) / 2) })}><AlignCenterHorizontal size={15} /></button>
                    <button className="icon-btn" title="Bottom edge" onClick={() => align({ top: round(H - current.height) })}><AlignEndHorizontal size={15} /></button>
                    <button className="icon-btn" title="Bring to front" onClick={() => reorder(current.id, true)}><BringToFront size={15} /></button>
                    <button className="icon-btn" title="Send to back" onClick={() => reorder(current.id, false)}><SendToBack size={15} /></button>
                  </div>
                </section>
              </div>
            ) : (
              <p className="u-muted designer-hint">{items.length ? 'Click an element on the label to edit it.' : 'Add a text, barcode, QR code or line to start.'}</p>
            )}

            {items.length ? (
              <section className="sd-layers">
                <h4>Elements</h4>
                {[...items].reverse().map((el) => {
                  const Icon = TYPE_ICON[el.type];
                  return (
                    <button key={el.id} className={el.id === selected ? 'sd-layer on' : 'sd-layer'} onClick={() => setSelected(el.id)}>
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
