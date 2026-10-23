import { ELEMENT_SPECS } from '@/lib/label-share/schema';
import { SEZLABEL_EXTENSION } from '@/lib/label-share/limits';
import { countsLine, groupMissing } from '@/lib/label-share/summary';
import { TOOLS, createElement, newId, type El } from './defaults';
import { addClipartFile, addImage, clipart, clipartUrl, exportSezlabel, imageUrl, images, openSezlabel } from './io';
import { RULER_PX, PAD_PX, boxOf, fmt, layerOrder, renderLabel, type Unit } from './render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ───────────────────────────── state ─────────────────────────────
type Doc = Record<string, any> & { widthMm: number; heightMm: number; elements: El[] };

const blank = (name = 'New label', widthMm = 50, heightMm = 30): Doc => ({
  id: newId('label'), name, widthMm, heightMm, orientation: 0, paperType: 'Label', mediaShape: 'rectangle',
  background: { type: 'color', color: '#FFFFFF' }, elements: [], groupId: null, createdAt: Date.now(), updatedAt: Date.now(),
});

let doc: Doc = blank();
let selectedId: string | null = null;
const ui = { pxPerMm: 8, unit: 'mm' as Unit, showGrid: false, gridMm: 5, snapMm: 0.5, screenPpi: 96 };
let undo: string[] = [];
let redo: string[] = [];

const selected = () => doc.elements.find((e) => e.id === selectedId) ?? null;
function commit() {
  undo.push(JSON.stringify(doc));
  if (undo.length > 100) undo.shift();
  redo = [];
}
function restore(json: string) {
  doc = JSON.parse(json);
  if (!doc.elements.some((e) => e.id === selectedId)) selectedId = null;
  drawAll();
}
const snap = (v: number) => (ui.snapMm > 0 ? Math.round(v / ui.snapMm) * ui.snapMm : v);
const round = (v: number) => Math.round(v * 1000) / 1000;

// ───────────────────────────── canvas ─────────────────────────────
function drawCanvas() {
  const { svg } = renderLabel(doc, {
    pxPerMm: ui.pxPerMm, unit: ui.unit, showGrid: ui.showGrid, gridMm: ui.gridMm, selectedId, chrome: true,
    imageUrl, clipartUrl, now: new Date(),
  });
  $('stageHost').innerHTML = svg;
  $('zoomLabel').textContent = `${ui.pxPerMm.toFixed(2)} px/mm · ${(ui.pxPerMm * 25.4).toFixed(0)} px/in`;
  $('sizeLabel').textContent = `${fmt(doc.widthMm, ui.unit)} × ${fmt(doc.heightMm, ui.unit)}`;
}

function drawAll() {
  drawCanvas();
  drawPanels();
  $('undoBtn').toggleAttribute('disabled', undo.length === 0);
  $('redoBtn').toggleAttribute('disabled', redo.length === 0);
}

// ───────────────────────────── panels ─────────────────────────────
function field(label: string, input: string, hint = ''): string {
  return `<label class="f"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>${input}</label>`;
}
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function specInput(key: string, spec: any, value: unknown): string {
  if (spec.k === 'bool') return `<input type="checkbox" data-key="${key}" ${value ? 'checked' : ''}>`;
  if (spec.k === 'enum') {
    return `<select data-key="${key}">${spec.values.map((v: string) => `<option ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}${spec.opt ? `<option value="" ${value == null ? 'selected' : ''}>(not set)</option>` : ''}</select>`;
  }
  if (spec.k === 'num') {
    return `<input type="number" data-key="${key}" step="${spec.int ? 1 : 0.1}" min="${spec.min}" max="${spec.max}" value="${value ?? ''}" ${spec.opt ? 'placeholder="(not set)"' : ''}>`;
  }
  if (['text', 'content'].includes(key)) return `<textarea data-key="${key}" rows="2">${esc(value)}</textarea>`;
  return `<input type="text" data-key="${key}" value="${esc(value)}">`;
}

const COMMON_FIRST = ['left', 'top', 'width', 'height', 'rotation'];

function drawPanels() {
  // Label
  $('labelPanel').innerHTML = [
    field('Name', `<input id="lName" value="${esc(doc.name)}">`),
    field('Width (mm)', `<input id="lW" type="number" step="0.1" min="1" max="2000" value="${doc.widthMm}">`),
    field('Height (mm)', `<input id="lH" type="number" step="0.1" min="1" max="2000" value="${doc.heightMm}">`),
    field('Orientation', `<select id="lOri">${[0, 90, 180, 270].map((o) => `<option ${o === doc.orientation ? 'selected' : ''}>${o}</option>`).join('')}</select>`),
    field('Paper', `<select id="lPaper">${['Label', 'Receipt', 'Transparent', 'Cardstock'].map((p) => `<option ${p === doc.paperType ? 'selected' : ''}>${p}</option>`).join('')}</select>`),
    field('Shape', `<select id="lShape">${['rectangle', 'roundedRectangle', 'circle', 'ellipse', 'diecut'].map((p) => `<option ${p === (doc.mediaShape ?? 'rectangle') ? 'selected' : ''}>${p}</option>`).join('')}</select>`),
    field('Background', `<input id="lBg" type="color" value="${doc.background?.type === 'color' ? doc.background.color.slice(0, 7) : '#ffffff'}">`),
  ].join('');

  // Element
  const el = selected();
  const host = $('elPanel');
  if (!el) {
    host.innerHTML = '<p class="muted">Select an element on the label or in Layers.</p>';
  } else {
    const specs = ELEMENT_SPECS[el.type] ?? {};
    const keys = [...COMMON_FIRST.filter((k) => k in specs), ...Object.keys(specs).filter((k) => !COMMON_FIRST.includes(k))];
    const b = boxOf(el);
    host.innerHTML = `
      <div class="elhead"><b>${esc(el.type)}</b><span class="muted">${fmt(b.w, ui.unit)} × ${fmt(b.h, ui.unit)}</span></div>
      <div class="btns">
        <button id="bFwd">Forward</button><button id="bBack">Backward</button><button id="bDup">Duplicate</button><button id="bDel" class="danger">Delete</button>
      </div>
      ${keys.map((k) => field(k, specInput(k, specs[k], el[k]))).join('')}
      <details><summary>Advanced (raw JSON: serial, cells, strokes…)</summary>
        <textarea id="rawJson" rows="9" spellcheck="false">${esc(JSON.stringify(el, null, 2))}</textarea>
        <button id="rawApply">Apply JSON</button><span id="rawMsg" class="muted"></span>
      </details>`;
  }

  // Layers (top of the list = drawn last = on top)
  const order = layerOrder(doc.elements).slice().reverse();
  $('layers').innerHTML = order.length
    ? order.map((e) => `<li data-id="${e.id}" class="${e.id === selectedId ? 'on' : ''}"><span>${esc(e.type)}</span><em>${esc(layerName(e))}</em><small>z${e.zIndex ?? 0}${e.lockMovement ? ' 🔒' : ''}${e.visible === false ? ' 🚫' : ''}${e.needPrinting === false ? ' (no print)' : ''}</small></li>`).join('')
    : '<li class="muted">No elements yet.</li>';
}

function layerName(e: El): string {
  const v = e.text ?? e.content ?? e.clipartId ?? e.borderStyle ?? e.encodeMode ?? '';
  return String(v).replace(/\s+/g, ' ').slice(0, 24);
}

// ───────────────────────────── editing ─────────────────────────────
function setField(el: El, key: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const spec: any = ELEMENT_SPECS[el.type]?.[key];
  if (!spec) return;
  let value: any;
  if (spec.k === 'bool') value = (input as HTMLInputElement).checked;
  else if (spec.k === 'num') {
    if (input.value === '' && spec.opt) value = undefined;
    else {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      value = Math.min(spec.max, Math.max(spec.min, spec.int ? Math.round(n) : n));
    }
  } else value = input.value === '' && spec.opt ? undefined : input.value;
  if (value === undefined) delete el[key];
  else el[key] = value;
}

function onPanelInput(e: Event) {
  const t = e.target as HTMLInputElement;
  const el = selected();
  if (el && t.dataset.key) {
    setField(el, t.dataset.key, t);
    drawCanvas();
  }
}
function onPanelChange(e: Event) {
  const t = e.target as HTMLInputElement;
  if (selected() && t.dataset.key) {
    commit();
    drawAll();
  }
}

function addElement(type: string) {
  commit();
  const off = (doc.elements.length % 6) * 1.5;
  const at = { left: Math.min(2 + off, Math.max(0, doc.widthMm - 6)), top: Math.min(2 + off, Math.max(0, doc.heightMm - 6)) };
  const el = createElement(type, doc.widthMm, doc.heightMm, at);
  if (type === 'border') doc.elements = doc.elements.filter((x) => x.type !== 'border');
  doc.elements.push(el);
  selectedId = el.id;
  drawAll();
}

async function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Re-encode anything the browser can show (HEIC excluded) as PNG so it can ship in a .seznik. */
async function toPngBytes(file: File): Promise<Uint8Array | null> {
  const raw = new Uint8Array(await file.arrayBuffer());
  if ((raw[0] === 0x89 && raw[1] === 0x50) || (raw[0] === 0xff && raw[1] === 0xd8)) return raw;
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function addImageElement() {
  const file = await pickFile('image/*');
  if (!file) return;
  const bytes = await toPngBytes(file);
  const added = bytes ? addImage(bytes) : null;
  if (!added) return alert('That picture could not be read (PNG, JPEG or a browser-readable image).');
  commit();
  const aspect = added.asset.width / added.asset.height;
  let w = Math.min(doc.widthMm - 4, 30);
  let h = w / aspect;
  if (h > doc.heightMm - 4) { h = doc.heightMm - 4; w = h * aspect; }
  const el = createElement('image', doc.widthMm, doc.heightMm, { left: 2, top: 2 }, {
    uri: added.key, printUri: added.key, width: round(w), height: round(h), originalAspect: aspect,
    workingWidthPx: added.asset.width, workingHeightPx: added.asset.height,
  });
  doc.elements.push(el);
  selectedId = el.id;
  drawAll();
}

async function addClipartElement() {
  const id = prompt('Built-in clipart id (the art library is in the phone app, so it shows as a labelled box here).\nLeave empty to upload your own SVG / picture.', '');
  if (id === null) return;
  let clipartId = id.trim();
  if (!clipartId) {
    const file = await pickFile('.svg,image/svg+xml,image/png,image/jpeg');
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const made = addClipartFile(file.name.replace(/\.[^.]+$/, ''), bytes, /\.svg$/i.test(file.name) || file.type === 'image/svg+xml');
    if (!made) return alert('That clipart is not a safe SVG or a PNG/JPEG picture.');
    clipartId = made;
  }
  commit();
  const el = createElement('clipart', doc.widthMm, doc.heightMm, { left: 2, top: 2 }, { clipartId, width: 10, height: 10 });
  doc.elements.push(el);
  selectedId = el.id;
  drawAll();
}

function addSignatureElement() {
  const dlg = $<HTMLDialogElement>('sigDialog');
  const canvas = $<HTMLCanvasElement>('sigCanvas');
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let strokes: Array<Array<{ x: number; y: number }>> = [];
  let drawing = false;
  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  canvas.onpointerdown = (e) => { drawing = true; strokes.push([pos(e)]); canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = (e) => {
    if (!drawing) return;
    const s = strokes[strokes.length - 1];
    const p = pos(e);
    const q = s[s.length - 1];
    s.push(p);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(q.x * canvas.width, q.y * canvas.height); ctx.lineTo(p.x * canvas.width, p.y * canvas.height); ctx.stroke();
  };
  canvas.onpointerup = () => { drawing = false; };
  $('sigClear').onclick = () => { strokes = []; ctx.clearRect(0, 0, canvas.width, canvas.height); };
  $('sigCancel').onclick = () => dlg.close();
  $('sigDone').onclick = () => {
    dlg.close();
    if (!strokes.length) return;
    commit();
    const w = Math.min(30, doc.widthMm - 4);
    const el = createElement('signature', doc.widthMm, doc.heightMm, { left: 2, top: 2 }, {
      width: w, height: round(w * (canvas.height / canvas.width)),
      strokes: strokes.map((pts) => ({ points: pts.map((p) => ({ x: round(p.x), y: round(p.y) })), strokeWidth: 0.012 })),
    });
    doc.elements.push(el);
    selectedId = el.id;
    drawAll();
  };
  dlg.showModal();
}

async function handleTool(id: string) {
  if (id === 'image') return addImageElement();
  if (id === 'clipart') return addClipartElement();
  if (id === 'signature') return addSignatureElement();
  addElement(id);
}

// ───────────────────────────── pointer: select, move, resize ─────────────────────────────
type Drag = { mode: 'move' | 'resize'; id: string; startX: number; startY: number; left: number; top: number; w: number; h: number; moved: boolean };
let drag: Drag | null = null;

function toMm(e: PointerEvent) {
  const svg = $('stageHost').querySelector('svg')!.getBoundingClientRect();
  return { x: (e.clientX - svg.left - RULER_PX - PAD_PX) / ui.pxPerMm, y: (e.clientY - svg.top - RULER_PX - PAD_PX) / ui.pxPerMm };
}

function onStageDown(e: PointerEvent) {
  const target = e.target as Element;
  const handle = target.closest('[data-handle]');
  const node = target.closest('[data-el]');
  if (!node) {
    selectedId = null;
    drawAll();
    return;
  }
  const id = node.getAttribute('data-el')!;
  const el = doc.elements.find((x) => x.id === id)!;
  const changed = selectedId !== id;
  selectedId = id;
  const p = toMm(e);
  const b = boxOf(el);
  if (el.lockMovement && !handle) {
    drawAll();
    return;
  }
  drag = { mode: handle ? 'resize' : 'move', id, startX: p.x, startY: p.y, left: el.left, top: el.top, w: el.width, h: el.height ?? b.h, moved: false };
  if (changed) drawPanels();
  drawCanvas();
  e.preventDefault();
}

window.addEventListener('pointermove', (e) => {
  const host = $('stageHost');
  const svgEl = host.querySelector('svg');
  if (svgEl) {
    const p = toMm(e);
    const inside = p.x >= 0 && p.y >= 0 && p.x <= doc.widthMm && p.y <= doc.heightMm;
    $('cursorLabel').textContent = inside ? `x ${fmt(p.x, ui.unit)}  y ${fmt(p.y, ui.unit)}` : '—';
  }
  if (!drag) return;
  const el = doc.elements.find((x) => x.id === drag!.id);
  if (!el) return;
  const p = toMm(e);
  const dx = p.x - drag.startX;
  const dy = p.y - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) * ui.pxPerMm < 3) return;
  if (!drag.moved) { drag.moved = true; commit(); }
  if (drag.mode === 'move') {
    el.left = round(snap(drag.left + dx));
    el.top = round(snap(drag.top + dy));
  } else {
    el.width = Math.max(0.5, round(snap(drag.w + dx)));
    if (el.height !== undefined || !['text', 'degrees', 'time'].includes(el.type)) el.height = Math.max(0.2, round(snap(drag.h + dy)));
    if (el.type === 'text' || el.type === 'degrees') el.autoTextHeight = false === el.autoTextHeight ? false : el.autoTextHeight;
  }
  drawCanvas();
  syncInputs(el);
});
window.addEventListener('pointerup', () => {
  if (drag?.moved) drawPanels();
  drag = null;
});

function syncInputs(el: El) {
  document.querySelectorAll<HTMLInputElement>('#elPanel [data-key]').forEach((i) => {
    const k = i.dataset.key!;
    if (['left', 'top', 'width', 'height'].includes(k) && el[k] != null && i !== document.activeElement) i.value = String(el[k]);
  });
}

// ───────────────────────────── file IO ─────────────────────────────
function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function showReport(title: string, bodyHtml: string) {
  $('reportTitle').textContent = title;
  $('reportBody').innerHTML = bodyHtml;
  $<HTMLDialogElement>('report').showModal();
}

async function openFile(file: File) {
  try {
    const { doc: opened, parsed } = openSezlabel(new Uint8Array(await file.arrayBuffer()));
    undo = [JSON.stringify(doc)];
    redo = [];
    doc = opened;
    selectedId = null;
    fitView();
    drawAll();
    const groups = groupMissing(parsed.missing);
    const html = `<p><b>${esc(parsed.document.name)}</b><br>${fmt(parsed.document.widthMm, ui.unit)} × ${fmt(parsed.document.heightMm, ui.unit)} · ${esc(countsLine(parsed.counts))}</p>
      ${parsed.manifest.createdWithAppVersion ? `<p class="muted">Made with Sez Print ${esc(parsed.manifest.createdWithAppVersion)}</p>` : ''}
      ${parsed.paletteChanged ? '<p class="warn">Ink colours were set up differently in the app that made this label.</p>' : ''}
      ${parsed.bulkColumns.length ? `<p class="warn">Needs a spreadsheet. Columns expected: ${esc(parsed.bulkColumns.join(', '))}. The data is not in the file.</p>` : ''}
      ${groups.length ? groups.map((g) => `<h4>${esc(g.title)}</h4><ul>${g.items.map((i) => `<li>${esc(i.name)}${i.detail ? ` — <span class="muted">${esc(i.detail)}</span>` : ''}</li>`).join('')}</ul>`).join('') : '<p>Nothing is missing.</p>'}
      ${parsed.warnings.length ? `<details><summary>${parsed.warnings.length} note(s)</summary><ul>${parsed.warnings.slice(0, 40).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      ${parsed.manifest.knownLimits.map((l) => `<p class="muted">• ${esc(l)}</p>`).join('')}`;
    showReport('Opened label file', html);
  } catch (error) {
    showReport("Can't open this file", `<p class="warn">${esc(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

async function loadUrl(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url}`);
    await openFile(new File([await res.arrayBuffer()], url.split('/').pop() ?? 'label.seznik'));
  } catch (error) {
    showReport('Could not load', `<p class="warn">${esc(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

/** ?selftest=1 : export the current label, open the bytes again, and report in the page (used by headless checks). */
async function selfTest() {
  const out = document.createElement('pre');
  out.id = 'selftest';
  document.body.appendChild(out);
  try {
    await new Promise((r) => setTimeout(r, 500));
    const before = doc.elements.map((e) => `${e.type}:${e.left}:${e.top}:${e.width}`);
    const result = await exportSezlabel(doc, { includeUserClipart: true });
    const reopened = openSezlabel(result.bytes);
    const after = reopened.doc.elements.map((e: El) => `${e.type}:${e.left}:${e.top}:${e.width}`);
    const same = JSON.stringify(before) === JSON.stringify(after);
    out.textContent = `SELFTEST ${same ? 'OK' : 'MISMATCH'} elements=${before.length} bytes=${result.bytes.length} missing=${reopened.parsed.missing.length}`;
  } catch (error) {
    out.textContent = `SELFTEST FAIL ${error instanceof Error ? error.message : error}`;
  }
}

async function exportFile() {
  try {
    const { svg, width, height } = renderLabel(doc, { pxPerMm: 10, unit: 'mm', showGrid: false, gridMm: 5, selectedId: null, chrome: false, imageUrl: dataImage, clipartUrl: dataClipart, now: new Date() });
    const result = await exportSezlabel(doc, { includeUserClipart: $<HTMLInputElement>('incClipart').checked, previewSvg: { svg, w: width, h: height } });
    download(result.fileName, result.bytes as BlobPart, 'application/zip');
    const s = result.summary;
    showReport('Exported', `<p>Shared '${esc(doc.name)}' - ${s.images} image${s.images === 1 ? '' : 's'}${s.userClipart ? `, ${s.userClipart} own clipart` : ''}, no data</p>
      <p class="muted">${(result.bytes.length / 1024).toFixed(1)} KB · ${esc(result.fileName)}</p>
      ${s.skipped.length ? `<h4>Left out</h4><ul>${s.skipped.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`);
  } catch (error) {
    showReport('Export failed', `<p class="warn">${esc(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

// Pictures inside exported SVG/PNG must be self-contained.
const dataCache = new Map<string, string>();
function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}
function dataImage(uri: string): string | null {
  const a = images.get(uri);
  if (!a) return null;
  if (!dataCache.has(uri)) dataCache.set(uri, toDataUrl(a.bytes, a.mime));
  return dataCache.get(uri)!;
}
function dataClipart(id: string): string | null {
  const c = clipart.get(id);
  if (!c) return null;
  return c.kind === 'svg' ? c.url : c.bytes ? toDataUrl(c.bytes, c.mime) : null;
}

async function exportSvg() {
  const { svg } = renderLabel(doc, { pxPerMm: 10, unit: 'mm', showGrid: false, gridMm: 5, selectedId: null, chrome: false, imageUrl: dataImage, clipartUrl: dataClipart, now: new Date() });
  download(`${doc.name || 'label'}.svg`, svg, 'image/svg+xml');
}

async function exportPng() {
  const dpi = Number($<HTMLSelectElement>('pngDpi').value) || 203;
  const pxMm = dpi / 25.4;
  const { svg, width, height } = renderLabel(doc, { pxPerMm: pxMm, unit: 'mm', showGrid: false, gridMm: 5, selectedId: null, chrome: false, imageUrl: dataImage, clipartUrl: dataClipart, now: new Date() });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.round(width);
  c.height = Math.round(height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  c.toBlob((b) => b && download(`${doc.name || 'label'}-${dpi}dpi.png`, b, 'image/png'));
}

// ───────────────────────────── view ─────────────────────────────
function fitView() {
  const host = $('canvasScroll');
  const availW = host.clientWidth - RULER_PX - PAD_PX * 2;
  const availH = host.clientHeight - RULER_PX - PAD_PX * 2 - 40;
  ui.pxPerMm = Math.max(1, Math.min(60, Math.min(availW / doc.widthMm, availH / doc.heightMm)));
  $<HTMLInputElement>('zoom').value = String(ui.pxPerMm);
}

// ───────────────────────────── wiring ─────────────────────────────
function init() {
  $('tools').innerHTML = TOOLS.map((t) => `<button data-tool="${t.id}" ${t.web ? '' : 'disabled'} title="${t.web ? 'Add ' + t.label : (t.note ?? 'Phone only')}">${t.label}${t.web ? '' : '<small>phone</small>'}</button>`).join('');
  $('tools').addEventListener('click', (e) => {
    const b = (e.target as Element).closest('[data-tool]') as HTMLElement | null;
    if (b && !b.hasAttribute('disabled')) void handleTool(b.dataset.tool!);
  });

  $('stageHost').addEventListener('pointerdown', onStageDown as EventListener);
  $('elPanel').addEventListener('input', onPanelInput);
  $('elPanel').addEventListener('change', onPanelChange);
  $('elPanel').addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).id;
    const el = selected();
    if (!el) return;
    if (id === 'bDel') { commit(); doc.elements = doc.elements.filter((x) => x !== el); selectedId = null; drawAll(); }
    if (id === 'bDup') { commit(); const c = { ...clone(el), id: newId(), left: round(el.left + 2), top: round(el.top + 2) }; doc.elements.push(c); selectedId = c.id; drawAll(); }
    if (id === 'bFwd' || id === 'bBack') {
      commit();
      const zs = doc.elements.map((x) => x.zIndex ?? 0);
      el.zIndex = id === 'bFwd' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      drawAll();
    }
    if (id === 'rawApply') {
      try {
        const next = JSON.parse(($('rawJson') as HTMLTextAreaElement).value);
        if (!next || typeof next !== 'object' || next.type !== el.type) throw new Error('Keep the same "type".');
        commit();
        Object.keys(el).forEach((k) => delete (el as any)[k]);
        Object.assign(el, next, { id: el.id });
        drawAll();
      } catch (err) {
        $('rawMsg').textContent = ` ${err instanceof Error ? err.message : err}`;
      }
    }
  });
  $('layers').addEventListener('click', (e) => {
    const li = (e.target as Element).closest('li[data-id]') as HTMLElement | null;
    if (li) { selectedId = li.dataset.id!; drawAll(); }
  });

  const labelInput = (id: string, apply: (v: string) => void) =>
    $(id).addEventListener('input', (e) => { apply((e.target as HTMLInputElement).value); drawCanvas(); });
  document.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).closest('#labelPanel')) { commit(); drawAll(); }
  });
  $('labelPanel').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const num = (v: string) => Math.min(2000, Math.max(1, Number(v) || 1));
    if (t.id === 'lName') doc.name = t.value;
    if (t.id === 'lW') doc.widthMm = num(t.value);
    if (t.id === 'lH') doc.heightMm = num(t.value);
    if (t.id === 'lOri') doc.orientation = Number(t.value);
    if (t.id === 'lPaper') doc.paperType = t.value;
    if (t.id === 'lShape') doc.mediaShape = t.value;
    if (t.id === 'lBg') doc.background = { type: 'color', color: t.value.toUpperCase() };
    drawCanvas();
  });
  void labelInput;

  $<HTMLInputElement>('zoom').addEventListener('input', (e) => { ui.pxPerMm = Number((e.target as HTMLInputElement).value); drawCanvas(); });
  $('fitBtn').onclick = () => { fitView(); drawCanvas(); };
  $('realBtn').onclick = () => { ui.pxPerMm = ui.screenPpi / 25.4; $<HTMLInputElement>('zoom').value = String(ui.pxPerMm); drawCanvas(); };
  $<HTMLInputElement>('ppi').addEventListener('input', (e) => { ui.screenPpi = Math.max(40, Number((e.target as HTMLInputElement).value) || 96); });
  $<HTMLSelectElement>('unit').addEventListener('change', (e) => { ui.unit = (e.target as HTMLSelectElement).value as Unit; drawAll(); });
  $<HTMLInputElement>('grid').addEventListener('change', (e) => { ui.showGrid = (e.target as HTMLInputElement).checked; drawCanvas(); });
  $<HTMLInputElement>('gridMm').addEventListener('input', (e) => { ui.gridMm = Math.max(0.5, Number((e.target as HTMLInputElement).value) || 5); drawCanvas(); });
  $<HTMLInputElement>('snapMm').addEventListener('input', (e) => { ui.snapMm = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); });

  $('openBtn').onclick = async () => { const f = await pickFile(`.${SEZLABEL_EXTENSION},.zip,application/zip`); if (f) void openFile(f); };
  $('exportBtn').onclick = () => void exportFile();
  $('svgBtn').onclick = () => void exportSvg();
  $('pngBtn').onclick = () => void exportPng();
  $('newBtn').onclick = () => {
    const v = prompt('New label size in mm (width x height)', '50x30');
    const m = v?.match(/^\s*([\d.]+)\s*[x×,]\s*([\d.]+)\s*$/i);
    if (!m) return;
    commit();
    doc = blank('New label', Number(m[1]), Number(m[2]));
    selectedId = null;
    fitView();
    drawAll();
  };
  $('undoBtn').onclick = () => { const last = undo.pop(); if (last) { redo.push(JSON.stringify(doc)); restore(last); } };
  $('redoBtn').onclick = () => { const next = redo.pop(); if (next) { undo.push(JSON.stringify(doc)); restore(next); } };
  $('closeReport').onclick = () => $<HTMLDialogElement>('report').close();

  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) void openFile(f); });
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input,textarea,select')) return;
    const el = selected();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); ($(e.shiftKey ? 'redoBtn' : 'undoBtn') as HTMLButtonElement).click(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); $('redoBtn').click(); return; }
    if (!el) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { commit(); doc.elements = doc.elements.filter((x) => x !== el); selectedId = null; drawAll(); }
    const step = e.shiftKey ? 1 : 0.1;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key] && !el.lockMovement) { e.preventDefault(); commit(); el.left = round(el.left + move[e.key][0]); el.top = round(el.top + move[e.key][1]); drawAll(); }
  });
  window.addEventListener('resize', () => drawCanvas());

  $('sampleBtn').onclick = () => void loadUrl('sample.seznik');
  // ?size=50x30&add=text,barcode,qrcode starts a new label with elements (handy for demos and tests).
  const q = new URLSearchParams(location.search);
  const sz = q.get('size')?.match(/^([\d.]+)x([\d.]+)$/i);
  if (sz) doc = blank('New label', Number(sz[1]), Number(sz[2]));
  for (const t of (q.get('add') ?? '').split(',').filter(Boolean)) if (!['image', 'clipart', 'signature'].includes(t)) addElement(t);
  selectedId = null;
  const auto = q.get('open');
  if (auto) void loadUrl(auto);

  if (q.get('selftest')) void selfTest();

  fitView();
  drawAll();
  // Time elements are live.
  setInterval(() => { if (doc.elements.some((e) => e.type === 'time') && !drag) drawCanvas(); }, 1000);
}

init();
