'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';

import { useDesk, useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { SampleDesigner } from '@/components/sample-designer';
import { api } from '@/lib/client';
import { can } from '@/lib/permissions';

type Kind = 'template' | 'clipart';
type Category = { id: string; name: string; items: number };
type Item = {
  id: string; name: string; categoryId: string; widthMm: number | null; heightMm: number | null;
  status: 'draft' | 'published'; svgCode: string; updatedAt: string; sampleLayout?: unknown;
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

const preview = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const fileName = (name: string) => name.replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').trim();

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

  const [form, setForm] = useState({ name: '', categoryId: '', widthMm: '', heightMm: '', status: 'published' });
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState('');

  const [open, setOpen] = useState<Item | null>(null);
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
    if (!f) return;
    setForm((cur) => ({ ...cur, name: cur.name || fileName(f.name) }));
    void f.text().then((text) => setFilePreview(preview(text))).catch(() => {});
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
      setFile(null); setFilePreview('');
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

  async function saveItem(replacement?: File) {
    if (!open) return;
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(edit).forEach(([k, v]) => body.set(k, v));
      if (replacement) body.set('file', replacement);
      const saved = await send(`${base}/items/${open.id}`, 'PATCH', body);
      toast(replacement ? 'Picture replaced' : 'Saved');
      setOpen(saved.item);
      loadItems(); loadCategories();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
    finally { setBusy(false); }
  }

  async function deleteItem() {
    if (!open || !window.confirm(`Delete “${open.name}”? This cannot be undone.`)) return;
    try { await api(`${base}/items/${open.id}`, { method: 'DELETE' }); setOpen(null); loadItems(); loadCategories(); toast('Deleted'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'bad'); }
  }

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <PageHeader kicker={copy.kicker} title={copy.title} lede={copy.lede}>
        <button type="button" className="btn ghost" onClick={() => { loadCategories(); loadItems(); }}>Refresh</button>
      </PageHeader>

      <div className="lib-layout">
        <aside className="panel lib-side">
          <h2>Categories</h2>
          <button className={categoryId === '' ? 'lib-cat on' : 'lib-cat'} onClick={() => setCategoryId('')}>
            <span>All</span><small>{categories.reduce((n, c) => n + c.items, 0)}</small>
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
          {canEdit ? (
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
                    <label>Width (mm)<input inputMode="decimal" value={form.widthMm} onChange={(e) => setForm({ ...form, widthMm: e.target.value })} placeholder={kind === 'template' ? 'From the file' : 'Optional'} /></label>
                    <label>Height (mm)<input inputMode="decimal" value={form.heightMm} onChange={(e) => setForm({ ...form, heightMm: e.target.value })} placeholder={kind === 'template' ? 'From the file' : 'Optional'} /></label>
                  </div>
                  <div className="seg" role="group" aria-label="Status">
                    <button type="button" className={form.status === 'published' ? 'on' : ''} onClick={() => setForm({ ...form, status: 'published' })}>Publish</button>
                    <button type="button" className={form.status === 'draft' ? 'on' : ''} onClick={() => setForm({ ...form, status: 'draft' })}>Draft</button>
                  </div>
                </div>
              </div>
              <div className="form-actions"><button className="btn primary" type="submit" disabled={busy || !file || !form.categoryId}>{busy ? 'Saving…' : `Save ${copy.noun}`}</button></div>
            </form>
          ) : null}

          <section className="panel">
            <div className="chart-head">
              <div><h2>{copy.title}</h2><p className="chart-sum"><b>{total}</b> <span>{categoryId ? `in ${categoryName(categoryId)}` : 'in total'}</span></p></div>
              <label className="modal-search"><Search size={14} /><input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></label>
            </div>
            <div className="lib-grid">
              {items.map((item) => (
                <button key={item.id} type="button" className="lib-card" onClick={() => openItem(item)}>
                  <div className="lib-thumb"><img src={preview(item.svgCode)} alt={item.name} loading="lazy" /></div>
                  <b>{item.name}</b>
                  <small>{categoryName(item.categoryId)}{item.widthMm && item.heightMm ? ` · ${Math.round(item.widthMm * 10) / 10} × ${Math.round(item.heightMm * 10) / 10} mm` : ''}</small>
                  <span className={item.status === 'published' ? 'badge shipped' : 'badge draft'}>{item.status}</span>
                </button>
              ))}
            </div>
            {items.length === 0 ? <p className="empty">{total === 0 && !q && !categoryId ? `No ${copy.title.toLowerCase()} yet. Upload the first one above.` : 'Nothing matches.'}</p> : null}
          </section>
        </div>
      </div>

      {open ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label={open.name}>
            <div className="modal-head">
              <div><h2>{open.name}</h2><p>{categoryName(open.categoryId)}</p></div>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="lib-thumb big"><img src={preview(open.svgCode)} alt={open.name} /></div>
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
                  </div>
                  <input ref={replaceInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void saveItem(f); e.target.value = ''; }} />
                </>
              ) : null}
            </div>
            {canEdit ? (
              <div className="modal-foot lib-foot">
                <button className="btn danger" onClick={deleteItem}><Trash2 size={13} /> Delete</button>
                <span style={{ flex: 1 }} />
                {kind === 'template' ? (
                  <button className="btn" onClick={() => setDesigning(open)}>
                    {Array.isArray(open.sampleLayout) && open.sampleLayout.length ? 'Edit sample' : 'Design sample'}
                  </button>
                ) : null}
                <button className="btn" onClick={() => replaceInput.current?.click()}>Replace SVG</button>
                <button className="btn primary" disabled={busy} onClick={() => saveItem()}>Save</button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {designing ? (
        <SampleDesigner
          template={designing}
          onClose={() => setDesigning(null)}
          onSaved={(layout) => {
            const next = { ...designing, sampleLayout: layout.length ? layout : null };
            setDesigning(next);
            setOpen((cur) => (cur && cur.id === next.id ? next : cur));
            loadItems();
          }}
        />
      ) : null}
    </>
  );
}
