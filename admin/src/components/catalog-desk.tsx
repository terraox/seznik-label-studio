'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useDesk, useToast } from '@/components/desk';
import { Drawer, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { can } from '@/lib/permissions';

type Kind = 'clipart' | 'template';
type Category = { id: string; kind: Kind; name: string; items: number };
type Item = {
  id: string; kind: Kind; categoryId: string; name: string; widthMm: number | null; heightMm: number | null;
  version: number; status: 'draft' | 'published'; revision: number; svgUrl: string; thumbUrl: string | null; fileSizeBytes: number;
};
type Analysis =
  | { fileName: string; ok: false; code: string; message: string }
  | {
      fileName: string; ok: true; stagingKey: string; suggestedName: string; previewUrl: string; bytes: number;
      widthMm: number | null; heightMm: number | null; removed: { what: string; count: number }[]; warnings: string[];
      unsupportedForApp: string[]; duplicateOf: { id: string; name: string } | null;
    };
type Draft = { name: string; categoryId: string; widthMm: string; heightMm: string; done?: string };

export function CatalogDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'catalog.edit');
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<Kind>('clipart');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [uploads, setUploads] = useState<Analysis[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [edit, setEdit] = useState({ name: '', categoryId: '', widthMm: '', heightMm: '' });

  const loadCategories = useCallback(() => {
    api<{ categories: Category[] }>(`/api/catalog/categories?kind=${kind}`).then((r) => setCategories(r.categories)).catch((e: Error) => toast(e.message, 'bad'));
  }, [kind, toast]);

  const loadItems = useCallback(() => {
    const params = new URLSearchParams({ kind });
    if (categoryId) params.set('categoryId', categoryId);
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    api<{ items: Item[]; total: number }>(`/api/catalog/items?${params}`).then((r) => { setItems(r.items); setTotal(r.total); }).catch((e: Error) => toast(e.message, 'bad'));
  }, [kind, categoryId, q, status, toast]);

  useEffect(loadCategories, [loadCategories]);
  useEffect(() => {
    const timer = window.setTimeout(loadItems, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadItems, q]);
  useEffect(() => { setCategoryId(''); setUploads([]); }, [kind]);

  const refresh = () => { loadCategories(); loadItems(); };
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';

  async function addCategory() {
    try {
      await api('/api/catalog/categories', { method: 'POST', body: JSON.stringify({ kind, name: newCategory }) });
      setNewCategory('');
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not add', 'bad'); }
  }
  async function renameCategory(c: Category) {
    const name = window.prompt('New name for this category', c.name);
    if (!name || name === c.name) return;
    try { await api(`/api/catalog/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not rename', 'bad'); }
  }
  async function deleteCategory(c: Category) {
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    try { await api(`/api/catalog/categories/${c.id}`, { method: 'DELETE' }); if (categoryId === c.id) setCategoryId(''); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'bad'); }
  }

  async function sendFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('files', f));
    setBusy(true);
    try {
      const r = await api<{ results: Analysis[] }>('/api/catalog/uploads', { method: 'POST', body: form });
      setUploads(r.results);
      const next: Record<string, Draft> = {};
      for (const a of r.results) {
        if (a.ok) next[a.stagingKey] = { name: a.suggestedName, categoryId: categoryId || categories[0]?.id || '', widthMm: String(a.widthMm ?? ''), heightMm: String(a.heightMm ?? '') };
      }
      setDrafts(next);
    } catch (e) { toast(e instanceof Error ? e.message : 'Upload failed', 'bad'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function publish(a: Extract<Analysis, { ok: true }>, publishNow: boolean) {
    const d = drafts[a.stagingKey];
    try {
      await api('/api/catalog/items', {
        method: 'POST',
        body: JSON.stringify({
          stagingKey: a.stagingKey, name: d.name, categoryId: d.categoryId, kind, status: publishNow ? 'published' : 'draft',
          ...(kind === 'template' ? { widthMm: Number(d.widthMm), heightMm: Number(d.heightMm) } : {}),
        }),
      });
      setDrafts((all) => ({ ...all, [a.stagingKey]: { ...d, done: publishNow ? 'Published' : 'Saved as draft' } }));
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
  }

  function openItem(item: Item) {
    setOpen(item);
    setEdit({ name: item.name, categoryId: item.categoryId, widthMm: String(item.widthMm ?? ''), heightMm: String(item.heightMm ?? '') });
  }

  async function saveItem(patch: Record<string, unknown>, done: string) {
    if (!open) return;
    try {
      const r = await api<{ item: Item }>(`/api/catalog/items/${open.id}`, { method: 'PATCH', headers: { 'If-Match': String(open.revision) }, body: JSON.stringify(patch) });
      setOpen(r.item);
      toast(done);
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save', 'bad'); }
  }

  async function replaceFile(files: FileList | null) {
    if (!open || !files?.[0]) return;
    const form = new FormData();
    form.append('files', files[0]);
    try {
      const up = await api<{ results: Analysis[] }>('/api/catalog/uploads', { method: 'POST', body: form });
      const a = up.results[0];
      if (!a.ok) throw new Error(a.message);
      const r = await api<{ item: Item }>(`/api/catalog/items/${open.id}/replace`, { method: 'POST', headers: { 'If-Match': String(open.revision) }, body: JSON.stringify({ stagingKey: a.stagingKey }) });
      setOpen(r.item);
      toast('Picture replaced (new version)');
      refresh();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not replace', 'bad'); }
    finally { if (replaceInput.current) replaceInput.current.value = ''; }
  }

  async function deleteItem() {
    if (!open || !window.confirm(`Delete "${open.name}"? It disappears from the app on its next sync. Labels already saved with it keep working.`)) return;
    try { await api(`/api/catalog/items/${open.id}`, { method: 'DELETE' }); setOpen(null); toast('Deleted'); refresh(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not delete', 'bad'); }
  }

  const pickable = categories;

  return (
    <>
      <PageHeader kicker="Library" title="Clipart and templates" lede="Upload SVG pictures and label templates. Files are cleaned on upload; published items reach the app on its next sync, without an app update.">
        {canEdit ? (
          <>
            <input ref={fileInput} type="file" accept=".svg,image/svg+xml" multiple hidden onChange={(e) => sendFiles(e.target.files)} />
            <button className="btn primary" disabled={busy || pickable.length === 0} onClick={() => fileInput.current?.click()} title={pickable.length === 0 ? 'Create a category first' : ''}>
              {busy ? 'Checking…' : 'Upload SVGs'}
            </button>
          </>
        ) : null}
        <button className="btn ghost" onClick={refresh}>Refresh</button>
      </PageHeader>

      <div className="chips" style={{ marginBottom: 14 }}>
        {(['clipart', 'template'] as Kind[]).map((k) => (
          <button key={k} className={kind === k ? 'chip active' : 'chip'} onClick={() => setKind(k)}>{k === 'clipart' ? 'Clipart' : 'Templates'}</button>
        ))}
      </div>

      {uploads.length > 0 ? (
        <section className="panel" style={{ marginBottom: 14 }}>
          <h2>Review before publishing</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {uploads.map((a, i) => a.ok ? (
              <article className="card-row" key={a.stagingKey}>
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.previewUrl} alt="" width={96} height={96} style={{ objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <small>{a.fileName} · {(a.bytes / 1024).toFixed(1)} KB</small>
                    {drafts[a.stagingKey]?.done ? <p><span className="badge shipped">{drafts[a.stagingKey].done}</span></p> : (
                      <>
                        <input value={drafts[a.stagingKey]?.name ?? ''} maxLength={80} onChange={(e) => setDrafts({ ...drafts, [a.stagingKey]: { ...drafts[a.stagingKey], name: e.target.value } })} aria-label="Name" />
                        <select value={drafts[a.stagingKey]?.categoryId ?? ''} onChange={(e) => setDrafts({ ...drafts, [a.stagingKey]: { ...drafts[a.stagingKey], categoryId: e.target.value } })} aria-label="Category">
                          {pickable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {kind === 'template' ? (
                          <div className="toolbar" style={{ margin: '6px 0 0' }}>
                            <input style={{ width: 70 }} value={drafts[a.stagingKey]?.widthMm ?? ''} onChange={(e) => setDrafts({ ...drafts, [a.stagingKey]: { ...drafts[a.stagingKey], widthMm: e.target.value } })} aria-label="Width mm" /> ×
                            <input style={{ width: 70 }} value={drafts[a.stagingKey]?.heightMm ?? ''} onChange={(e) => setDrafts({ ...drafts, [a.stagingKey]: { ...drafts[a.stagingKey], heightMm: e.target.value } })} aria-label="Height mm" /> mm
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                {a.duplicateOf ? <div className="note" style={{ marginTop: 8 }}>Already in the library as “{a.duplicateOf.name}”.</div> : null}
                {a.removed.length > 0 ? <div className="note" style={{ marginTop: 8 }}>Removed for safety: {a.removed.map((r) => `${r.what}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')}</div> : null}
                {a.warnings.map((w) => <div className="note" key={w} style={{ marginTop: 8 }}>{w}</div>)}
                {!drafts[a.stagingKey]?.done ? (
                  <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
                    <button className="btn small primary" onClick={() => publish(a, true)}>Publish</button>
                    <button className="btn small" onClick={() => publish(a, false)}>Save as draft</button>
                  </div>
                ) : null}
              </article>
            ) : (
              <article className="card-row" key={i}>
                <strong>{a.fileName}</strong>
                <div className="note" style={{ marginTop: 8 }}>Not accepted: {a.message}</div>
              </article>
            ))}
          </div>
          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => setUploads([])}>Close review</button>
        </section>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 14, alignItems: 'start' }}>
        <section className="panel">
          <h2>Categories</h2>
          <button className={categoryId === '' ? 'chip active' : 'chip'} style={{ width: '100%', marginBottom: 6 }} onClick={() => setCategoryId('')}>All</button>
          {categories.map((c) => (
            <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <button className={categoryId === c.id ? 'chip active' : 'chip'} style={{ flex: 1, textAlign: 'left' }} onClick={() => setCategoryId(c.id)}>{c.name} ({c.items})</button>
              {canEdit ? (
                <>
                  <button className="btn small ghost" onClick={() => renameCategory(c)} aria-label={`Rename ${c.name}`}>✎</button>
                  <button className="btn small ghost" onClick={() => deleteCategory(c)} aria-label={`Delete ${c.name}`}>✕</button>
                </>
              ) : null}
            </div>
          ))}
          {categories.length === 0 ? <p className="lede">No categories yet.</p> : null}
          {canEdit ? (
            <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
              <input placeholder="New category" value={newCategory} maxLength={60} onChange={(e) => setNewCategory(e.target.value)} />
              <button className="btn small primary" disabled={!newCategory.trim()} onClick={addCategory}>Add</button>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <div className="toolbar">
            <input type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">Drafts and published</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
            <span>{total} item{total === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
            {items.map((item) => (
              <button key={item.id} type="button" className="card-row" onClick={() => openItem(item)} style={{ textAlign: 'left', cursor: 'pointer' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl ?? item.svgUrl} alt="" style={{ width: '100%', height: 96, objectFit: 'contain', background: '#fff', borderRadius: 6 }} />
                <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <small>
                  <span className={item.status === 'published' ? 'badge shipped' : 'badge draft'}>{item.status}</span>{' '}
                  {item.kind === 'template' && item.widthMm ? `${item.widthMm}×${item.heightMm} mm` : `v${item.version}`}
                </small>
              </button>
            ))}
            {items.length === 0 ? <p>Nothing here yet.{canEdit ? ' Upload some SVGs.' : ''}</p> : null}
          </div>
        </section>
      </div>

      {open ? (
        <Drawer title={open.name} lede={`${open.kind} · ${catName(open.categoryId)} · version ${open.version} · ${(open.fileSizeBytes / 1024).toFixed(1)} KB`} onClose={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.svgUrl} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }} />
          <p><span className={open.status === 'published' ? 'badge shipped' : 'badge draft'}>{open.status}</span> · <a href={open.svgUrl} target="_blank" rel="noreferrer">open file</a></p>
          {canEdit ? (
            <>
              <Field label="Name"><input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Category">
                <select value={edit.categoryId} onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {open.kind === 'template' ? (
                <div className="toolbar" style={{ marginTop: 10 }}>
                  <input style={{ width: 80 }} value={edit.widthMm} onChange={(e) => setEdit({ ...edit, widthMm: e.target.value })} aria-label="Width mm" /> ×
                  <input style={{ width: 80 }} value={edit.heightMm} onChange={(e) => setEdit({ ...edit, heightMm: e.target.value })} aria-label="Height mm" /> mm
                </div>
              ) : null}
              <div className="toolbar" style={{ marginTop: 12 }}>
                <button className="btn primary" onClick={() => saveItem({ name: edit.name, categoryId: edit.categoryId, ...(open.kind === 'template' ? { widthMm: Number(edit.widthMm), heightMm: Number(edit.heightMm) } : {}) }, 'Saved')}>Save</button>
                <button className="btn" onClick={() => saveItem({ status: open.status === 'published' ? 'draft' : 'published' }, open.status === 'published' ? 'Unpublished' : 'Published')}>
                  {open.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <input ref={replaceInput} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => replaceFile(e.target.files)} />
                <button className="btn" onClick={() => replaceInput.current?.click()}>Replace picture</button>
                <button className="btn danger" onClick={deleteItem}>Delete</button>
              </div>
            </>
          ) : null}
        </Drawer>
      ) : null}
    </>
  );
}
