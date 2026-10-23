'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, Eye, LayoutGrid, List, PenTool, Pencil, Plus, Power, PowerOff, RotateCcw, RotateCw, Search, Shapes, Trash2, Upload, X } from 'lucide-react';

import { useDesk, useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { SampleDesigner, SamplePreview } from '@/components/sample-designer';
import { detectSvgSizeMm, type SvgSize } from '@/lib/catalog/svg-size';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type Kind = 'template' | 'clipart';
type Category = { id: string; name: string; items: number };
type Item = {
  id: string; name: string; categoryId: string; widthMm: number | null; heightMm: number | null;
  status: 'draft' | 'published' | 'disabled'; svgCode: string; updatedAt: string; sampleLayout?: unknown;
};
type SaveResult = { item: Item; removed: { what: string; count: number }[]; warnings?: string[] };

const COPY = {
  template: {
    title: 'Templates', kicker: 'Library', noun: 'template',
    lede: 'Upload a label template as an SVG, give it a name and a category. Published templates reach the app.',
  },
  clipart: {
    title: 'Clipart', kicker: 'Library', noun: 'clipart',
    lede: 'Clipart you add here appears in the app next to the clipart that already ships with it.',
  },
} as const;

/** Data URL for a thumbnail; the viewBox gets a little room so outlines on the very edge are not clipped. */
function preview(svg: string) {
  const padded = svg.replace(/(<svg\b[^>]*?\sviewBox=")([^"]+)(")/i, (whole, a: string, box: string, c: string) => {
    const [x, y, w, h] = box.trim().split(/[\s,]+/).map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return whole;
    const pad = Math.max(w, h) * 0.03;
    return `${a}${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}${c}`;
  });
  return `data:image/svg+xml;utf8,${encodeURIComponent(padded)}`;
}
const fileName = (name: string) => name.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim();
const mm = (n: number) => Math.round(n * 10) / 10;
const hasSample = (item: Item) => Array.isArray(item.sampleLayout) && item.sampleLayout.length > 0;

/** The template drawn blank or with its sample content. */
function ItemPicture({ item, withSample, lazy }: { item: Item; withSample: boolean; lazy?: boolean }) {
  return withSample && hasSample(item)
    ? <SamplePreview svgCode={item.svgCode} widthMm={item.widthMm} heightMm={item.heightMm} layout={item.sampleLayout} />
    : <img src={preview(item.svgCode)} alt={item.name} loading={lazy ? 'lazy' : undefined} />;
}

/** Design / Blank switch over a picture. Shown only when there is a sample to switch. */
function SampleToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="seg lib-sample-toggle" role="group" aria-label="Sample content" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={on ? 'on' : ''} onClick={() => onChange(true)}>Design</button>
      <button type="button" className={on ? '' : 'on'} onClick={() => onChange(false)}>Blank</button>
    </div>
  );
}

/** The SVG's own viewBox as numbers, or null when it has none. */
function viewBoxOf(svg: string): [number, number, number, number] | null {
  const raw = /<svg\b[^>]*?\sviewBox="([^"]+)"/i.exec(svg)?.[1];
  const box = raw?.trim().split(/[\s,]+/).map(Number);
  return box && box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? (box as [number, number, number, number]) : null;
}

/**
 * Turns the SVG a quarter turn. The drawing is wrapped in a rotate, and the viewBox and any width/height swap.
 * Templates only: the app draws template outlines with full SVG, but its clipart reader ignores transforms.
 */
function rotateSvg(svg: string, clockwise: boolean): string | null {
  const box = viewBoxOf(svg);
  const root = /<svg\b[^>]*>/i.exec(svg);
  const end = svg.lastIndexOf('</svg>');
  if (!box || !root || end < root.index) return null;
  const [x, y, w, h] = box;
  const turn = clockwise ? `translate(${h} 0) rotate(90)` : `translate(0 ${w}) rotate(-90)`;
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(root[0])?.[1];
  const width = attr('width');
  const height = attr('height');
  let head = root[0].replace(/\sviewBox="[^"]*"/i, ` viewBox="0 0 ${h} ${w}"`);
  if (width && height) head = head.replace(/\swidth="[^"]*"/, ` width="${height}"`).replace(/\sheight="[^"]*"/, ` height="${width}"`);
  const body = svg.slice(root.index + root[0].length, end);
  return `${head}<g transform="${turn} translate(${-x} ${-y})">${body}</g></svg>`;
}

/** Full-size look at one item: the SVG on the left, everything known about it on the right. */
function ItemViewer({ item, noun, category, canEdit, paused, onEdit, onDesign, onClose }: {
  item: Item; noun: string; category: string; canEdit: boolean; paused: boolean; onEdit: () => void; onDesign: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [withSample, setWithSample] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !paused) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, paused]);

  const box = viewBoxOf(item.svgCode);
  const fileSize = detectSvgSizeMm(item.svgCode);
  const bytes = new Blob([item.svgCode]).size;
  const shapes = (item.svgCode.match(/<(path|circle|rect|ellipse|line|polygon|polyline)\b/gi) ?? []).length;
  // The app stretches the SVG to the label size, so a different shape here means a squashed outline.
  const sized = item.widthMm && item.heightMm ? { w: item.widthMm, h: item.heightMm } : null;
  const off = box && sized ? (box[2] / box[3]) / (sized.w / sized.h) : 1;
  const stretched = Math.abs(off - 1) > 0.02;

  function download() {
    const url = URL.createObjectURL(new Blob([item.svgCode], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || noun}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button className="drawer-back designer-back" aria-label="Close" onClick={onClose} />
      <div className="designer lib-view" role="dialog" aria-modal="true" aria-label={item.name}>
        <div className="designer-head">
          <div><h2>{item.name}</h2><p>{category}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="designer-body">
          <div className="lib-view-stage">
            {withSample && hasSample(item)
              ? <SamplePreview svgCode={item.svgCode} widthMm={item.widthMm} heightMm={item.heightMm} layout={item.sampleLayout} dim={item.status === 'disabled'} />
              : <img src={preview(item.svgCode)} alt={item.name} className={item.status === 'disabled' ? 'dim' : undefined} />}
            {hasSample(item) ? <SampleToggle on={withSample} onChange={setWithSample} /> : null}
          </div>
          <aside className="designer-side lib-view-side">
            <dl className="lib-view-facts">
              <dt>Status</dt>
              <dd><span className={item.status === 'published' ? 'badge shipped' : item.status === 'disabled' ? 'badge rejected' : 'badge draft'}>{item.status}</span></dd>
              <dt>Category</dt><dd>{category || '—'}</dd>
              <dt>Label size</dt><dd className="u-mono">{sized ? `${mm(sized.w)} × ${mm(sized.h)} mm` : '—'}</dd>
              <dt>Size in the SVG</dt>
              <dd>{fileSize ? <><span className="u-mono">{mm(fileSize.widthMm)} × {mm(fileSize.heightMm)} mm</span><small className="lib-view-from">from the {fileSize.from}</small></> : '—'}</dd>
              <dt>SVG viewBox</dt><dd className="u-mono">{box ? box.map((n) => Math.round(n * 100) / 100).join(' ') : 'none'}</dd>
              {box && sized ? (
                <>
                  <dt>Proportions</dt>
                  <dd>{stretched
                    ? <span className="lib-view-warn">The SVG is {off > 1 ? 'wider' : 'taller'} than the label size, so the app stretches it. A {mm(sized.w)} mm wide label would be {mm(sized.w * box[3] / box[2])} mm tall.</span>
                    : 'Matches the label size'}</dd>
                </>
              ) : null}
              <dt>Shapes</dt><dd>{shapes}</dd>
              <dt>File size</dt><dd>{bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 102.4) / 10} KB`}</dd>
              {noun === 'template' ? <><dt>Sample</dt><dd>{hasSample(item) ? 'Designed' : 'None yet'}</dd></> : null}
              <dt>Updated</dt><dd title={new Date(item.updatedAt).toLocaleString()}>{ago(item.updatedAt)}</dd>
              <dt>ID</dt><dd className="u-mono lib-view-id">{item.id}</dd>
            </dl>
            <div className="designer-actions">
              <button className="btn small" onClick={download}><Download size={13} /> Download SVG</button>
              <button className="btn small" onClick={() => { void navigator.clipboard.writeText(item.svgCode).then(() => toast('SVG code copied'), () => toast('Could not copy', 'bad')); }}><Copy size={13} /> Copy code</button>
            </div>
          </aside>
        </div>
        {canEdit ? (
          <div className="designer-foot">
            <span style={{ flex: 1 }} />
            {noun === 'template' ? <button className="btn" onClick={onDesign}><PenTool size={13} /> {hasSample(item) ? 'Edit design' : 'Design sample'}</button> : null}
            <button className="btn primary" onClick={onEdit}><Pencil size={13} /> Edit</button>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function LibraryDesk({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'catalog.edit');
  const base = `/api/library/${kind}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [layout, setLayout] = useState<'tiles' | 'list'>('tiles');
  const [showSample, setShowSample] = useState(true);
  const [modalSample, setModalSample] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem('sez-admin-lib-layout') === 'list') setLayout('list');
      if (localStorage.getItem('sez-admin-lib-sample') === 'blank') setShowSample(false);
    } catch { /* default */ }
  }, []);
  const chooseSample = (value: boolean) => {
    setShowSample(value);
    try { localStorage.setItem('sez-admin-lib-sample', value ? 'design' : 'blank'); } catch { /* ignore */ }
  };
  const chooseLayout = (value: 'tiles' | 'list') => {
    setLayout(value);
    try { localStorage.setItem('sez-admin-lib-layout', value); } catch { /* ignore */ }
  };
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'disabled'>('all');

  const [form, setForm] = useState({ name: '', categoryId: '', widthMm: '', heightMm: '', status: 'published' });
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const [fileSize, setFileSize] = useState<SvgSize | null>(null);

  const [open, setOpen] = useState<Item | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [designing, setDesigning] = useState<Item | null>(null);
  const [edit, setEdit] = useState({ name: '', categoryId: '', widthMm: '', heightMm: '', status: 'published' });

  const loadCategories = useCallback(() => {
    api<{ categories: Category[] }>(`${base}/categories`).then((r) => setCategories(r.categories)).catch((e: Error) => toast(e.message, 'bad'));
  }, [base, toast]);

  const loadItems = useCallback(() => {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    if (q.trim()) params.set('q', q.trim());
    api<{ items: Item[]; total: number }>(`${base}/items?${params}`).then((r) => { setItems(r.items); setTotal(r.total); }).catch((e: Error) => toast(e.message, 'bad'));
  }, [base, categoryId, q, toast]);

  useEffect(loadCategories, [loadCategories]);
  useEffect(() => {
    const timer = window.setTimeout(loadItems, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadItems, q]);

  async function send(url: string, method: 'POST' | 'PATCH', body: FormData): Promise<SaveResult> {
    const res = await fetch(url, { method, body });
    const data = (await res.json().catch(() => ({}))) as SaveResult & { error?: string };
    if (!res.ok) throw new Error(data.error || 'Could not save.');
    return data;
  }

  function pickFile(f: File | null) {
    setFile(f);
    setFilePreview('');
    setFileSize(null);
    if (!f) return;
    setForm((cur) => ({ ...cur, name: cur.name || fileName(f.name) }));
    void f.text().then((text) => { setFilePreview(preview(text)); setFileSize(detectSvgSizeMm(text)); }).catch(() => {});
  }

  async function addCategory() {
    try {
      await api(`${base}/categories`, { method: 'POST', body: JSON.stringify({ name: newCategory }) });
      setNewCategory('');
      loadCategories();
      toast('Category added');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not add', 'bad'); }
  }

  async function renameCategory(c: Category) {
    const name = window.prompt('Rename category', c.name);
    if (!name || name === c.name) return;
    try { await api(`${base}/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); loadCategories(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not rename', 'bad'); }
  }

  async function deleteCategory(c: Category) {
    if (!window.confirm(`Delete the category “${c.name}”?`)) return;
    try {
      await api(`${base}/categories/${c.id}`, { method: 'DELETE' });
      if (categoryId === c.id) setCategoryId('');
      loadCategories();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'bad'); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return toast('Choose an SVG file first', 'bad');
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('name', form.name);
      body.set('categoryId', form.categoryId);
      body.set('status', form.status);
      if (form.widthMm) body.set('widthMm', form.widthMm);
      if (form.heightMm) body.set('heightMm', form.heightMm);
      const saved = await send(`${base}/items`, 'POST', body);
      const removed = saved.removed.length ? ` (removed for safety: ${saved.removed.map((r) => r.what).join(', ')})` : '';
      toast(`${form.status === 'published' ? 'Published' : 'Saved as draft'}${removed}`);
      setFile(null); setFilePreview(''); setFileSize(null);
      setShowForm(false);
      if (fileInput.current) fileInput.current.value = '';
      setForm((cur) => ({ ...cur, name: '', widthMm: '', heightMm: '' }));
      loadItems(); loadCategories();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
    finally { setBusy(false); }
  }

  function openItem(item: Item) {
    setOpen(item);
    setEdit({ name: item.name, categoryId: item.categoryId, widthMm: item.widthMm?.toString() ?? '', heightMm: item.heightMm?.toString() ?? '', status: item.status });
  }

  async function saveItem(replacement?: File, fields = edit, done = replacement ? 'Picture replaced' : 'Saved') {
    if (!open) return;
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(fields).forEach(([k, v]) => body.set(k, v));
      if (replacement) body.set('file', replacement);
      const saved = await send(`${base}/items/${open.id}`, 'PATCH', body);
      toast(done);
      setOpen(saved.item);
      loadItems(); loadCategories();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
    finally { setBusy(false); }
  }

  /** Turns the template a quarter turn and saves it; width and height swap with it. */
  async function rotate(clockwise: boolean) {
    if (!open) return;
    const turned = rotateSvg(open.svgCode, clockwise);
    if (!turned) return toast('This SVG has no viewBox, so it cannot be turned', 'bad');
    const hasSample = Array.isArray(open.sampleLayout) && open.sampleLayout.length > 0;
    if (hasSample && !window.confirm('The designed sample does not turn with it. Check it afterwards. Turn anyway?')) return;
    const fields = { ...edit, widthMm: edit.heightMm, heightMm: edit.widthMm };
    setEdit(fields);
    await saveItem(new File([turned], 'turned.svg', { type: 'image/svg+xml' }), fields, clockwise ? 'Turned right' : 'Turned left');
  }

  /** Switches the template off (kept, but hidden from the app) or back on. */
  async function toggleDisabled(target: Item | null = open) {
    if (!target) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('status', target.status === 'disabled' ? 'published' : 'disabled');
      const saved = await send(`${base}/items/${target.id}`, 'PATCH', body);
      toast(saved.item.status === 'disabled' ? 'Disabled. It is kept, but the app no longer gets it' : 'Enabled and published');
      if (open?.id === target.id) {
        setOpen(saved.item);
        setEdit((cur) => ({ ...cur, status: saved.item.status }));
      }
      loadItems(); loadCategories();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
    finally { setBusy(false); }
  }

  async function deleteItem(target: Item | null = open) {
    if (!target || !window.confirm(`Delete “${target.name}” for good? This cannot be undone. Use Disable to keep it.`)) return;
    try { await api(`${base}/items/${target.id}`, { method: 'DELETE' }); setOpen((cur) => (cur?.id === target.id ? null : cur)); loadItems(); loadCategories(); toast('Deleted'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'bad'); }
  }

  const shown = items.filter((i) => statusFilter === 'all' || i.status === statusFilter);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <PageHeader kicker={copy.kicker} title={copy.title} lede={copy.lede}>
        <button type="button" className="btn ghost" onClick={() => { loadCategories(); loadItems(); }}>Refresh</button>
        {canEdit ? (
          <button type="button" className="btn primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <><X size={14} /> Close</> : <><Plus size={14} /> Add {copy.noun}</>}
          </button>
        ) : null}
      </PageHeader>

      <div className={`lib-layout${kind === 'clipart' ? ' lib-clip' : ''}`}>
        <aside className="panel lib-side">
          <h2>Categories</h2>
          <button className={categoryId === '' ? 'lib-cat on' : 'lib-cat'} onClick={() => setCategoryId('')}>
            <span>All {copy.title.toLowerCase()}</span><small>{categories.reduce((n, c) => n + c.items, 0)}</small>
          </button>
          {categories.map((c) => (
            <div key={c.id} className="lib-cat-row">
              <button className={categoryId === c.id ? 'lib-cat on' : 'lib-cat'} onClick={() => setCategoryId(c.id)}>
                <span>{c.name}</span><small>{c.items}</small>
              </button>
              {canEdit ? (
                <>
                  <button className="icon-btn" onClick={() => renameCategory(c)} aria-label={`Rename ${c.name}`}><Pencil size={13} /></button>
                  <button className="icon-btn" onClick={() => deleteCategory(c)} aria-label={`Delete ${c.name}`}><Trash2 size={13} /></button>
                </>
              ) : null}
            </div>
          ))}
          {categories.length === 0 ? <p className="u-muted">No categories yet. Add the first one below.</p> : null}
          {canEdit ? (
            <div className="lib-add-cat">
              <input placeholder="New category" value={newCategory} maxLength={60} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newCategory.trim()) void addCategory(); }} />
              <button className="btn small primary" disabled={!newCategory.trim()} onClick={addCategory}><Plus size={13} /> Add</button>
            </div>
          ) : null}
        </aside>

        <div className="lib-main">
          {canEdit && showForm ? (
            <form className="panel lib-form" onSubmit={submit}>
              <h2>Add {copy.noun}</h2>
              <div className="lib-form-grid">
                <button type="button" className={`lib-drop${file ? ' has' : ''}`} onClick={() => fileInput.current?.click()}>
                  {filePreview ? <img src={filePreview} alt="Preview" /> : <><Upload size={22} /><span>Choose an SVG file</span></>}
                </button>
                <input ref={fileInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                <div className="lib-fields">
                  <label>Name<input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
                  <label>Category
                    <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                      <option value="">{categories.length ? 'Choose a category' : 'Create a category first'}</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <div className="lib-size">
                    <label>Width (mm)<input inputMode="decimal" value={form.widthMm} onChange={(e) => setForm({ ...form, widthMm: e.target.value })} placeholder={fileSize ? `${mm(fileSize.widthMm)} from the file` : kind === 'template' ? 'From the file' : 'Optional'} /></label>
                    <label>Height (mm)<input inputMode="decimal" value={form.heightMm} onChange={(e) => setForm({ ...form, heightMm: e.target.value })} placeholder={fileSize ? `${mm(fileSize.heightMm)} from the file` : kind === 'template' ? 'From the file' : 'Optional'} /></label>
                  </div>
                  {fileSize ? (
                    <p className="lib-file-size">
                      The file is <b>{mm(fileSize.widthMm)} × {mm(fileSize.heightMm)} mm</b> (from its {fileSize.from}). Leave the size blank to use it.
                      {' '}<button type="button" className="u-link" onClick={() => setForm({ ...form, widthMm: String(mm(fileSize.widthMm)), heightMm: String(mm(fileSize.heightMm)) })}>Fill in</button>
                    </p>
                  ) : null}
                  <div className="seg" role="group" aria-label="Status">
                    <button type="button" className={form.status === 'published' ? 'on' : ''} onClick={() => setForm({ ...form, status: 'published' })}>Publish</button>
                    <button type="button" className={form.status === 'draft' ? 'on' : ''} onClick={() => setForm({ ...form, status: 'draft' })}>Draft</button>
                  </div>
                </div>
              </div>
              <div className="form-actions"><button className="btn primary" type="submit" disabled={busy || !file || !form.categoryId}>{busy ? 'Saving…' : `Save ${copy.noun}`}</button></div>
            </form>
          ) : null}

          <section className="panel lib-panel">
            <div className="lib-head">
              <div className="lib-title">
                <h2>{categoryId ? categoryName(categoryId) : `All ${copy.title.toLowerCase()}`}</h2>
                <span className="lib-count">{shown.length}{shown.length !== total ? ` of ${total}` : ''}</span>
              </div>
              <div className="lib-tools">
                <div className="seg" role="group" aria-label="Status">
                  {(['all', 'published', 'draft', 'disabled'] as const).map((v) => (
                    <button key={v} type="button" className={statusFilter === v ? 'on' : ''} onClick={() => setStatusFilter(v)}>{v === 'all' ? 'All' : v[0].toUpperCase() + v.slice(1)}</button>
                  ))}
                </div>
                {kind === 'template' ? (
                  <div className="seg" role="group" aria-label="Show sample content">
                    <button type="button" className={showSample ? 'on' : ''} onClick={() => chooseSample(true)} title="Show each template with its sample design">Design</button>
                    <button type="button" className={showSample ? '' : 'on'} onClick={() => chooseSample(false)} title="Show the blank templates">Blank</button>
                  </div>
                ) : null}
                <div className="seg" role="group" aria-label="Layout">
                  <button type="button" className={layout === 'tiles' ? 'on' : ''} onClick={() => chooseLayout('tiles')} aria-label="Tiles" title="Tiles"><LayoutGrid size={14} /></button>
                  <button type="button" className={layout === 'list' ? 'on' : ''} onClick={() => chooseLayout('list')} aria-label="List" title="List"><List size={14} /></button>
                </div>
                <label className="modal-search"><Search size={14} /><input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
              </div>
            </div>
            {layout === 'tiles' ? <div className="lib-grid">
              {shown.map((item) => (
                <button key={item.id} type="button" className="lib-card" onClick={() => openItem(item)}>
                  <div className={item.status === 'disabled' ? 'lib-thumb dim' : 'lib-thumb'}>
                    <ItemPicture item={item} withSample={kind === 'template' && showSample} lazy />
                    {kind === 'template' && hasSample(item) && !showSample ? <span className="lib-design-badge">Has design</span> : null}
                    <span className={item.status === 'published' ? 'lib-pill live' : item.status === 'disabled' ? 'lib-pill off' : 'lib-pill'}>{item.status === 'published' ? 'Published' : item.status === 'disabled' ? 'Disabled' : 'Draft'}</span>
                  </div>
                  <div className="lib-info">
                    <b title={item.name}>{item.name}</b>
                    <small>
                      {item.widthMm && item.heightMm ? <span className="lib-size-tag">{Math.round(item.widthMm * 10) / 10} × {Math.round(item.heightMm * 10) / 10} mm</span> : null}
                      <span className="lib-cat-chip">{categoryName(item.categoryId)}</span>
                    </small>
                    <span className="lib-acts" onClick={(e) => e.stopPropagation()}>
                      <span role="button" tabIndex={0} className="lib-act view" title="View" aria-label={`View ${item.name}`}
                        onClick={(e) => { e.stopPropagation(); setViewing(item); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setViewing(item); } }}><Eye size={13} /></span>
                      {canEdit && kind === 'template' ? (
                        <span role="button" tabIndex={0} className="lib-act design" title={hasSample(item) ? 'Edit design' : 'Design sample'} aria-label={`Design ${item.name}`}
                          onClick={(e) => { e.stopPropagation(); setDesigning(item); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setDesigning(item); } }}><PenTool size={13} /></span>
                      ) : null}
                      {canEdit ? (<>
                        <span role="button" tabIndex={0} className={`lib-act ${item.status === 'disabled' ? 'enable' : 'disable'}`} title={item.status === 'disabled' ? 'Enable' : 'Disable'} aria-label={`${item.status === 'disabled' ? 'Enable' : 'Disable'} ${item.name}`}
                          onClick={(e) => { e.stopPropagation(); void toggleDisabled(item); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void toggleDisabled(item); } }}>{item.status === 'disabled' ? <Power size={13} /> : <PowerOff size={13} />}</span>
                        <span role="button" tabIndex={0} className="lib-act del" title="Delete" aria-label={`Delete ${item.name}`}
                          onClick={(e) => { e.stopPropagation(); void deleteItem(item); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void deleteItem(item); } }}><Trash2 size={13} /></span>
                      </>) : null}
                    </span>
                  </div>
                </button>
              ))}
            </div> : (
              <div className="u-scroll lib-list">
                <table className="table u-table" style={{ minWidth: 0 }}>
                  <thead><tr><th>Template</th><th>Category</th><th>Size</th><th>Sample</th><th>Status</th><th>Updated</th><th className="num" /></tr></thead>
                  <tbody>
                    {shown.map((item) => (
                      <tr key={item.id} className="u-row" onClick={() => openItem(item)}>
                        <td>
                          <div className="lib-row-name">
                            <span className="lib-mini"><ItemPicture item={item} withSample={kind === 'template' && showSample} lazy /></span>
                            <b>{item.name}</b>
                          </div>
                        </td>
                        <td><span className="lib-cat-chip">{categoryName(item.categoryId)}</span></td>
                        <td className="u-mono">{item.widthMm && item.heightMm ? `${Math.round(item.widthMm * 10) / 10} × ${Math.round(item.heightMm * 10) / 10} mm` : '—'}</td>
                        <td>{Array.isArray(item.sampleLayout) && item.sampleLayout.length ? <span className="lib-has-sample">Sample</span> : <span className="u-muted">—</span>}</td>
                        <td><span className={item.status === 'published' ? 'badge shipped' : item.status === 'disabled' ? 'badge rejected' : 'badge draft'}>{item.status}</span></td>
                        <td>{ago(item.updatedAt)}</td>
                        <td className="num lib-row-acts" onClick={(e) => e.stopPropagation()}>
                          <button className="btn small" onClick={() => setViewing(item)} aria-label={`View ${item.name}`} title="View"><Eye size={12} /></button>
                          {canEdit ? <>
                            <button className="btn small" disabled={busy} onClick={() => toggleDisabled(item)}>{item.status === 'disabled' ? <><Power size={12} /> Enable</> : <><PowerOff size={12} /> Disable</>}</button>
                            <button className="btn small danger" onClick={() => deleteItem(item)}><Trash2 size={12} /> Delete</button>
                          </> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {shown.length === 0 ? (
              <div className="lib-empty">
                <Shapes size={28} aria-hidden />
                <p>{total === 0 && !q && !categoryId ? `No ${copy.title.toLowerCase()} yet.` : 'Nothing matches.'}</p>
                {canEdit && total === 0 && !q && !categoryId ? <button className="btn primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add {copy.noun}</button> : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {open ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="modal lib-modal" role="dialog" aria-modal="true" aria-label={open.name}>
            <div className="modal-head">
              <div><h2>{open.name}</h2><p>{categoryName(open.categoryId)}</p></div>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="lib-thumb big">
                <ItemPicture item={open} withSample={modalSample} />
                {kind === 'template' && hasSample(open) ? <SampleToggle on={modalSample} onChange={setModalSample} /> : null}
                {canEdit && kind === 'template' ? (
                  <span className="lib-rotate">
                    <button type="button" className="lib-act" disabled={busy} onClick={() => rotate(false)} title="Turn left 90°" aria-label="Turn left 90°"><RotateCcw size={14} /></button>
                    <button type="button" className="lib-act" disabled={busy} onClick={() => rotate(true)} title="Turn right 90°" aria-label="Turn right 90°"><RotateCw size={14} /></button>
                  </span>
                ) : null}
              </div>
              {canEdit ? (
                <>
                  <label className="lib-label">Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                  <label className="lib-label">Category
                    <select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <div className="lib-size">
                    <label className="lib-label">Width (mm)<input inputMode="decimal" value={edit.widthMm} onChange={(e) => setEdit({ ...edit, widthMm: e.target.value })} /></label>
                    <label className="lib-label">Height (mm)<input inputMode="decimal" value={edit.heightMm} onChange={(e) => setEdit({ ...edit, heightMm: e.target.value })} /></label>
                  </div>
                  <div className="seg" role="group" aria-label="Status">
                    <button type="button" className={edit.status === 'published' ? 'on' : ''} onClick={() => setEdit({ ...edit, status: 'published' })}>Published</button>
                    <button type="button" className={edit.status === 'draft' ? 'on' : ''} onClick={() => setEdit({ ...edit, status: 'draft' })}>Draft</button>
                    <button type="button" className={edit.status === 'disabled' ? 'on' : ''} onClick={() => setEdit({ ...edit, status: 'disabled' })}>Disabled</button>
                  </div>
                  <input ref={replaceInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void saveItem(f); e.target.value = ''; }} />
                </>
              ) : null}
            </div>
            {canEdit ? (
              <div className="modal-foot lib-foot">
                <button className="btn danger" onClick={() => deleteItem()}><Trash2 size={13} /> Delete</button>
                <button className="btn" disabled={busy} onClick={() => toggleDisabled(open)}>
                  {open.status === 'disabled' ? <><Power size={13} /> Enable</> : <><PowerOff size={13} /> Disable</>}
                </button>
                <span style={{ flex: 1 }} />
                {kind === 'template' ? (
                  <button className="btn" onClick={() => setDesigning(open)}>
                    {hasSample(open) ? 'Edit design' : 'Design sample'}
                  </button>
                ) : null}
                <button className="btn" onClick={() => replaceInput.current?.click()}>Replace SVG</button>
                <button className="btn primary" disabled={busy} onClick={() => saveItem()}>Save</button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {viewing ? (
        <ItemViewer
          item={viewing}
          noun={copy.noun}
          category={categoryName(viewing.categoryId)}
          canEdit={canEdit}
          paused={!!designing}
          onEdit={() => { openItem(viewing); setViewing(null); }}
          onDesign={() => setDesigning(viewing)}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {designing ? (
        <SampleDesigner
          template={designing}
          onClose={() => setDesigning(null)}
          onSaved={(layout) => {
            const next = { ...designing, sampleLayout: layout.length ? layout : null };
            setDesigning(next);
            setOpen((cur) => (cur && cur.id === next.id ? next : cur));
            setViewing((cur) => (cur && cur.id === next.id ? next : cur));
            loadItems();
          }}
        />
      ) : null}
    </>
  );
}
