'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenterHorizontal, Copy, Minus, QrCode, ScanBarcode, Trash2, Type, X } from 'lucide-react';

import { useToast } from '@/components/desk';
import { api } from '@/lib/client';
import { sampleTextHeightMm, type SampleElement, type SampleElementType } from '@/lib/sample-layout';

type Template = { id: string; name: string; widthMm: number | null; heightMm: number | null; svgCode: string; sampleLayout?: unknown };
type Handle = 'nw' | 'ne' | 'sw' | 'se';

const PT_MM = 0.3528;
const SNAP_MM = 1.2;
const dataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const round = (n: number) => Math.round(n * 100) / 100;
let counter = 0;
const newId = () => `e${Date.now().toString(36)}${(counter += 1)}`;

/** A barcode-like stripe pattern, stable per text, so the preview reads as a barcode. */
function stripes(text: string, width: number) {
  let seed = 7;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  while (x < width) {
    seed = (seed * 48271) % 2147483647;
    const w = 0.4 + (seed % 4) * 0.35;
    if (bars.length % 2 === 0) bars.push({ x, w });
    x += w;
  }
  return bars;
}

function defaults(type: SampleElementType, w: number, h: number): SampleElement {
  const width = Math.min(w - 2, Math.max(8, w * 0.6));
  switch (type) {
    case 'text':
      return { id: newId(), type, left: 1, top: 1, width, height: sampleTextHeightMm(8, 1), text: 'Text', fontSize: 8, bold: false, align: 'left' };
    case 'barcode':
      return { id: newId(), type, left: 1, top: Math.max(1, h - 11), width, height: Math.min(10, h / 2), text: '8901234567890' };
    case 'qrcode': {
      const s = Math.min(14, w - 2, h - 2);
      return { id: newId(), type, left: 1, top: 1, width: s, height: s, text: 'https://seznik.in' };
    }
    default:
      return { id: newId(), type: 'line', left: 1, top: h / 2, width: w - 2, height: 0.4 };
  }
}

export function SampleDesigner({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: (layout: SampleElement[]) => void }) {
  const toast = useToast();
  const widthMm = template.widthMm ?? 50;
  const heightMm = template.heightMm ?? 30;
  const initial = useMemo(() => (Array.isArray(template.sampleLayout) ? (template.sampleLayout as SampleElement[]) : []), [template.sampleLayout]);
  const [items, setItems] = useState<SampleElement[]>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | Handle; sx: number; sy: number; start: SampleElement } | null>(null);

  // Fit the label into the available space; small labels are enlarged so they are easy to work on.
  const [box, setBox] = useState({ w: 760, h: 520 });
  useEffect(() => {
    const fit = () => setBox({ w: Math.max(280, Math.min(820, window.innerWidth - 420)), h: Math.max(240, window.innerHeight - 260) });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const scale = Math.max(2, Math.min(box.w / widthMm, box.h / heightMm));

  const change = useCallback((id: string, patch: Partial<SampleElement>) => {
    setItems((cur) => cur.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setDirty(true);
  }, []);
  const current = items.find((e) => e.id === selected) ?? null;

  function add(type: SampleElementType) {
    const el = defaults(type, widthMm, heightMm);
    setItems((cur) => [...cur, el]);
    setSelected(el.id);
    setDirty(true);
  }
  function remove(id: string) {
    setItems((cur) => cur.filter((e) => e.id !== id));
    setSelected(null);
    setDirty(true);
  }
  function duplicate(el: SampleElement) {
    const copy = { ...el, id: newId(), left: round(el.left + 2), top: round(el.top + 2) };
    setItems((cur) => [...cur, copy]);
    setSelected(copy.id);
    setDirty(true);
  }

  // Snap an edge or centre to the label's edges and centre line.
  function snap(value: number, size: number, limit: number) {
    const targets = [0, limit / 2 - size / 2, limit - size];
    for (const t of targets) if (Math.abs(value - t) < SNAP_MM) return t;
    return value;
  }

  function begin(event: React.PointerEvent, el: SampleElement, mode: 'move' | Handle) {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelected(el.id);
    drag.current = { id: el.id, mode, sx: event.clientX, sy: event.clientY, start: { ...el } };
  }

  function move(event: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.sx) / scale;
    const dy = (event.clientY - d.sy) / scale;
    const s = d.start;
    if (d.mode === 'move') {
      change(d.id, { left: round(snap(s.left + dx, s.width, widthMm)), top: round(snap(s.top + dy, s.height, heightMm)) });
      return;
    }
    let { left, top, width, height } = s;
    if (d.mode.includes('e')) width = s.width + dx;
    if (d.mode.includes('w')) { width = s.width - dx; left = s.left + dx; }
    if (d.mode.includes('s')) height = s.height + dy;
    if (d.mode.includes('n')) { height = s.height - dy; top = s.top + dy; }
    if (s.type === 'qrcode') { const side = Math.max(width, height); width = side; height = side; }
    if (s.type === 'line') { height = s.height; top = s.top; }
    if (width < 0.5 || height < 0.2) return;
    change(d.id, { left: round(left), top: round(top), width: round(width), height: round(height) });
  }

  function end() {
    drag.current = null;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !selected) return;
      const step = e.shiftKey ? 2 : 0.5;
      const el = items.find((i) => i.id === selected);
      if (!el) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selected); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); change(selected, { left: round(el.left - step) }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); change(selected, { left: round(el.left + step) }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); change(selected, { top: round(el.top - step) }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); change(selected, { top: round(el.top + step) }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, items, change]);

  function setText(el: SampleElement, text: string) {
    const patch: Partial<SampleElement> = { text };
    if (el.type === 'text') patch.height = sampleTextHeightMm(el.fontSize ?? 8, text.split('\n').length);
    change(el.id, patch);
  }
  function setFont(el: SampleElement, fontSize: number) {
    change(el.id, { fontSize, height: sampleTextHeightMm(fontSize, (el.text ?? '').split('\n').length) });
  }

  async function save(layout: SampleElement[]) {
    setBusy(true);
    try {
      await api(`/api/library/template/items/${template.id}/sample`, { method: 'PUT', body: JSON.stringify({ layout }) });
      toast(layout.length ? 'Sample content saved' : 'Sample content cleared');
      setDirty(false);
      onSaved(layout);
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
    finally { setBusy(false); }
  }

  function applyJson() {
    try {
      const parsed: unknown = JSON.parse(json ?? '[]');
      if (!Array.isArray(parsed)) throw new Error('Must be a list');
      setItems(parsed.map((e, i) => ({ ...(e as SampleElement), id: (e as SampleElement).id || newId() + i })));
      setSelected(null);
      setDirty(true);
      setJson(null);
    } catch { toast('That is not a valid list of elements', 'bad'); }
  }

  const px = (mm: number) => mm * scale;

  return (
    <>
      <button className="drawer-back designer-back" aria-label="Close" onClick={() => (!dirty || window.confirm('Discard unsaved changes?')) && onClose()} />
      <div className="designer" role="dialog" aria-modal="true" aria-label={`Design sample for ${template.name}`}>
        <div className="designer-head">
          <div><h2>Design sample · {template.name}</h2><p>{round(widthMm)} × {round(heightMm)} mm. Drag to move, use the corners to resize, arrow keys to nudge. The app shows exactly this under “With sample data”.</p></div>
          <button type="button" className="icon-btn" onClick={() => (!dirty || window.confirm('Discard unsaved changes?')) && onClose()} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="designer-body">
          <div className="designer-stage-wrap" onPointerDown={() => setSelected(null)}>
            <div
              ref={stage}
              className="designer-stage"
              style={{ width: px(widthMm), height: px(heightMm) }}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="designer-svg" src={dataUri(template.svgCode)} alt="" draggable={false} />
              {items.map((el) => {
                const on = el.id === selected;
                const style: React.CSSProperties = { left: px(el.left), top: px(el.top), width: px(el.width), height: px(el.height) };
                return (
                  <div key={el.id} className={`designer-el ${el.type}${on ? ' on' : ''}`} style={style} onPointerDown={(e) => begin(e, el, 'move')}>
                    {el.type === 'text' ? (
                      <span style={{ fontSize: px((el.fontSize ?? 8) * PT_MM), fontWeight: el.bold ? 700 : 400, textAlign: el.align ?? 'left' }}>{el.text}</span>
                    ) : null}
                    {el.type === 'barcode' ? (
                      <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(el.width, 1)} ${Math.max(el.height, 1)}`} preserveAspectRatio="none">
                        {stripes(el.text ?? '', el.width).map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={el.height * 0.78} fill="#111" />)}
                        <text x={el.width / 2} y={el.height * 0.97} textAnchor="middle" fontSize={Math.max(1.4, el.height * 0.17)} fill="#111">{el.text}</text>
                      </svg>
                    ) : null}
                    {el.type === 'qrcode' ? (
                      <svg width="100%" height="100%" viewBox="0 0 21 21" preserveAspectRatio="none" shapeRendering="crispEdges">
                        {Array.from({ length: 21 * 21 }, (_, i) => {
                          const x = i % 21, y = Math.floor(i / 21);
                          const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                          const ring = finder && (x % 14 === 0 || y % 14 === 0 || x % 14 === 6 || y % 14 === 6 || (x % 14 > 1 && x % 14 < 5 && y % 14 > 1 && y % 14 < 5));
                          const bit = !finder && ((x * 7 + y * 13 + (el.text?.length ?? 0)) % 3 === 0);
                          return ring || bit ? <rect key={i} x={x} y={y} width={1} height={1} fill="#111" /> : null;
                        })}
                      </svg>
                    ) : null}
                    {el.type === 'line' ? <div className="designer-line" /> : null}
                    {on && el.type !== 'line'
                      ? (['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => <i key={h} className={`designer-handle ${h}`} onPointerDown={(e) => begin(e, el, h)} />)
                      : null}
                    {on && el.type === 'line'
                      ? (['nw', 'ne'] as Handle[]).map((h, i) => <i key={h} className={`designer-handle ${i ? 'ne' : 'nw'}`} style={{ top: '50%' }} onPointerDown={(e) => begin(e, el, i ? 'ne' : 'nw')} />)
                      : null}
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="designer-side">
            <div className="designer-add">
              <button className="btn small" onClick={() => add('text')}><Type size={13} /> Text</button>
              <button className="btn small" onClick={() => add('barcode')}><ScanBarcode size={13} /> Barcode</button>
              <button className="btn small" onClick={() => add('qrcode')}><QrCode size={13} /> QR</button>
              <button className="btn small" onClick={() => add('line')}><Minus size={13} /> Line</button>
            </div>

            {current ? (
              <div className="designer-props">
                <h3>{current.type === 'qrcode' ? 'QR code' : current.type[0].toUpperCase() + current.type.slice(1)}</h3>
                {current.type !== 'line' ? (
                  current.type === 'text' ? (
                    <label className="lib-label">Text<textarea rows={3} value={current.text ?? ''} onChange={(e) => setText(current, e.target.value)} /></label>
                  ) : (
                    <label className="lib-label">{current.type === 'barcode' ? 'Barcode value' : 'QR content'}<input value={current.text ?? ''} onChange={(e) => setText(current, e.target.value)} /></label>
                  )
                ) : null}
                {current.type === 'text' ? (
                  <>
                    <div className="lib-size">
                      <label className="lib-label">Font size (pt)<input inputMode="decimal" value={current.fontSize ?? 8} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setFont(current, v); }} /></label>
                      <label className="lib-label">Align
                        <select value={current.align ?? 'left'} onChange={(e) => change(current.id, { align: e.target.value as SampleElement['align'] })}>
                          <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                        </select>
                      </label>
                    </div>
                    <label className="designer-check"><input type="checkbox" checked={!!current.bold} onChange={(e) => change(current.id, { bold: e.target.checked })} /> Bold</label>
                  </>
                ) : null}
                <div className="designer-grid">
                  {(['left', 'top', 'width', 'height'] as const).map((k) => (
                    <label key={k} className="lib-label">{k === 'left' ? 'X' : k === 'top' ? 'Y' : k === 'width' ? 'Width' : 'Height'} (mm)
                      <input inputMode="decimal" value={current[k]} disabled={k === 'height' && current.type === 'text'} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) change(current.id, { [k]: v }); }} />
                    </label>
                  ))}
                </div>
                <div className="designer-actions">
                  <button className="btn small" onClick={() => change(current.id, { left: round((widthMm - current.width) / 2) })}><AlignCenterHorizontal size={13} /> Centre</button>
                  <button className="btn small" onClick={() => duplicate(current)}><Copy size={13} /> Duplicate</button>
                  <button className="btn small danger" onClick={() => remove(current.id)}><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            ) : (
              <p className="u-muted designer-hint">{items.length ? 'Click an element on the label to edit it.' : 'Add a text, barcode, QR code or line to start.'}</p>
            )}

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
          <span className="u-muted">{items.length} element{items.length === 1 ? '' : 's'}{dirty ? ' · unsaved changes' : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="btn danger" disabled={busy || (items.length === 0 && initial.length === 0)} onClick={() => window.confirm('Remove all sample content from this template?') && void save([])}>Clear sample</button>
          <button className="btn primary" disabled={busy || !dirty} onClick={() => void save(items)}>{busy ? 'Saving…' : 'Save sample'}</button>
        </div>
      </div>
    </>
  );
}
