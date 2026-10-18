'use client';

import { useCallback, useEffect, useState } from 'react';

import { useDesk, useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type Item = {
  id: string; rating: number; category: string; message: string | null; status: string; adminNote: string | null;
  appVersion: string | null; platform: string | null; createdAt: string; user: { name: string; mobile: string } | null;
};
type Data = {
  total: number; page: number; pageSize: number;
  summary: { count: number; average: number | null; distribution: { rating: number; count: number }[] };
  items: Item[];
};

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function FeedbackDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'feedback.edit');
  const [data, setData] = useState<Data | null>(null);
  const [rating, setRating] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hideInternal, setHideInternal] = useState(true);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (rating) params.set('rating', rating);
    if (category) params.set('category', category);
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (hideInternal) params.set('internal', 'hide');
    api<Data>(`/api/feedback?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, [page, rating, category, status, q, from, to, hideInternal]);

  useEffect(() => {
    const timer = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  async function save(item: Item, patch: { status?: string; adminNote?: string }) {
    try {
      await api(`/api/feedback/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      toast('Saved');
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'bad');
    }
  }

  const summary = data?.summary;
  const max = Math.max(1, ...(summary?.distribution.map((d) => d.count) ?? [1]));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <>
      <PageHeader kicker="Feedback" title="Ratings and suggestions" lede="What people send from the app: a 1-5 star rating, a category and an optional note.">
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Rating summary">
        <article className="kpi">
          <div className="kpi-top"><span className="kpi-title">Average rating</span></div>
          <div className="kpi-value">{summary ? (summary.average ?? '—') : '…'}</div>
          <div className="kpi-sub">{summary?.count ?? 0} ratings in total</div>
        </article>
        <article className="kpi" style={{ gridColumn: 'span 2' }}>
          <div className="kpi-top"><span className="kpi-title">Stars</span></div>
          {summary?.distribution.slice().reverse().map((d) => (
            <div key={d.rating} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
              <span style={{ width: 28 }}>{d.rating} ★</span>
              <div style={{ flex: 1, background: 'var(--paper-2)', borderRadius: 4, height: 8 }}>
                <div style={{ width: `${(d.count / max) * 100}%`, background: '#F59E0B', height: 8, borderRadius: 4 }} />
              </div>
              <span style={{ width: 28, textAlign: 'right' }}>{d.count}</span>
            </div>
          ))}
        </article>
      </section>

      <section className="panel">
        <div className="toolbar">
          <input type="search" placeholder="Search text or name" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Search" />
          <select value={rating} onChange={(e) => reset(setRating)(e.target.value)} aria-label="Rating">
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
          </select>
          <select value={category} onChange={(e) => reset(setCategory)(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            <option value="suggestion">Suggestion</option>
            <option value="bug">Bug</option>
            <option value="other">Other</option>
          </select>
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
          </select>
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={hideInternal} onChange={(e) => reset(setHideInternal)(e.target.checked)} /> Exclude internal accounts
          </label>
        </div>

        {data?.items.map((item) => (
          <article className="card-row" key={item.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ color: '#F59E0B' }}>{stars(item.rating)}</strong>
              <span>
                <span className="badge draft">{item.category}</span>{' '}
                <span className={item.status === 'resolved' ? 'badge shipped' : item.status === 'reviewed' ? 'badge reviewing' : 'badge'}>{item.status}</span>
              </span>
            </div>
            <p style={{ margin: '8px 0' }}>{item.message ?? <em>Rating only</em>}</p>
            <small>
              {item.user ? `${item.user.name} · ${item.user.mobile} · ` : ''}{ago(item.createdAt)}
              {item.appVersion ? ` · app ${item.appVersion}` : ''}{item.platform ? ` · ${item.platform}` : ''}
            </small>
            {item.adminNote ? <div className="note" style={{ marginTop: 8 }}>Admin note: {item.adminNote}</div> : null}
            {canEdit ? (
              <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
                {['new', 'reviewed', 'resolved'].map((s) => (
                  <button key={s} className={item.status === s ? 'btn small primary' : 'btn small'} disabled={item.status === s} onClick={() => save(item, { status: s })}>{s}</button>
                ))}
                {openId === item.id ? (
                  <>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the team" maxLength={1000} />
                    <button className="btn small primary" onClick={() => { save(item, { adminNote: note }); setOpenId(''); }}>Save note</button>
                  </>
                ) : (
                  <button className="btn small ghost" onClick={() => { setOpenId(item.id); setNote(item.adminNote ?? ''); }}>{item.adminNote ? 'Edit note' : 'Add note'}</button>
                )}
              </div>
            ) : null}
          </article>
        ))}
        {data && data.items.length === 0 ? <p>No feedback matches.</p> : null}

        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages} · {data?.total ?? 0} items</span>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </section>
    </>
  );
}
