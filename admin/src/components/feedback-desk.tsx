'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareText, Search, Star, ThumbsUp, X } from 'lucide-react';

import { useDesk, useHideInternal, useToast } from '@/components/desk';
import { PageHeader, Skeleton, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type Item = {
  id: string;
  rating: number | null;
  category: string;
  title: string | null;
  printerName: string | null;
  message: string | null;
  status: string;
  adminNote: string | null;
  appVersion: string | null;
  platform: string | null;
  createdAt: string;
  user: { name: string; mobile: string } | null;
};
type Data = {
  total: number; page: number; pageSize: number;
  summary: { count: number; average: number | null; distribution: { rating: number; count: number }[] };
  items: Item[];
};

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
  const [hideInternal] = useHideInternal();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Item | null>(null);
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
      setOpen((cur) => (cur && cur.id === item.id ? { ...cur, ...patch, adminNote: patch.adminNote ?? cur.adminNote } : cur));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'bad');
    }
  }

  const summary = data?.summary;
  const max = Math.max(1, ...(summary?.distribution.map((d) => d.count) ?? [1]));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const from_ = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const to_ = data ? Math.min(page * data.pageSize, data.total) : 0;
  const statusBadge = (st: string) => (st === 'resolved' ? 'badge shipped' : st === 'reviewed' ? 'badge reviewing' : 'badge');
  const fill = (n: number | null) =>
    n == null ? <span className="u-muted">—</span> : <span className="fb-stars" aria-label={`${n} out of 5`}>{'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i></span>;
  const kpis = [
    { title: 'Average rating', value: summary ? (summary.average ?? '—') : '…', sub: 'when stars were given', Icon: Star, color: '#F59E0B' },
    { title: 'Messages', value: summary ? summary.count.toLocaleString() : '…', sub: 'sent from the app', Icon: ThumbsUp, color: '#10B981' },
    { title: 'With a written note', value: data ? data.items.filter((i) => i.message || i.title).length.toLocaleString() : '…', sub: 'on this page', Icon: MessageSquareText, color: '#3B82F6' },
  ];

  return (
    <>
      <PageHeader kicker="Feedback" title="Suggestions and feedback" lede="What people send from the app: suggestion or feedback, optional printer, a title and a note.">
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Rating summary">
        {kpis.map(({ title, value, sub, Icon, color }) => (
          <article className="kpi" key={title}>
            <div className="kpi-top">
              <span className="kpi-title">{title}</span>
              <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}><Icon size={16} color={color} /></span>
            </div>
            <div className="kpi-value">{value === '…' ? <Skeleton /> : value}</div>
            <div className="kpi-sub">{sub}</div>
          </article>
        ))}
        <article className="kpi">
          <div className="kpi-top"><span className="kpi-title">Stars</span></div>
          <div className="fb-dist">
            {summary?.distribution.slice().reverse().map((d) => (
              <button key={d.rating} type="button" className={rating === String(d.rating) ? 'fb-bar on' : 'fb-bar'} onClick={() => reset(setRating)(rating === String(d.rating) ? '' : String(d.rating))} title={`Show ${d.rating} star feedback`}>
                <span>{d.rating} ★</span>
                <div><i style={{ width: `${(d.count / max) * 100}%` }} /></div>
                <b>{d.count}</b>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input type="search" placeholder="Search text or name…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Search" />
            {q ? <button type="button" className="u-clear" onClick={() => reset(setQ)('')} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
          <div className="seg" role="group" aria-label="Status">
            {[['', 'All'], ['new', 'New'], ['reviewed', 'Reviewed'], ['resolved', 'Resolved']].map(([v, label]) => (
              <button key={v} type="button" className={status === v ? 'on' : ''} onClick={() => reset(setStatus)(v)}>{label}</button>
            ))}
          </div>
          <select className="u-select" value={category} onChange={(e) => reset(setCategory)(e.target.value)} aria-label="Category">
            <option value="">All types</option>
            <option value="suggestion">Suggestion</option>
            <option value="feedback">Feedback</option>
          </select>
          <select className="u-select" value={rating} onChange={(e) => reset(setRating)(e.target.value)} aria-label="Rating">
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
          </select>
          <input className="u-select" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} aria-label="From date" />
          <input className="u-select" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} aria-label="To date" />
        </div>

        <div className="u-scroll">
          <table className="table u-table">
            <thead><tr><th>Type</th><th>Title / message</th><th>Printer</th><th>From</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id} className="u-row" onClick={() => { setOpen(item); setNote(item.adminNote ?? ''); }}>
                  <td><span className="badge draft">{item.category}</span>{item.rating != null ? <small className="u-id">{fill(item.rating)}</small> : null}</td>
                  <td className="fb-msg">
                    {item.title ? <b>{item.title}</b> : null}
                    {item.message ? <span>{item.message}</span> : !item.title ? <span className="u-muted">No message</span> : null}
                    {item.adminNote ? <small className="u-id">Note: {item.adminNote}</small> : null}
                  </td>
                  <td>{item.printerName ? <span className="badge">{item.printerName}</span> : <span className="u-muted">—</span>}</td>
                  <td>{item.user ? <div className="u-printer"><b>{item.user.name}</b><small>{item.user.mobile}</small></div> : <span className="u-muted">Anonymous</span>}</td>
                  <td><span className={statusBadge(item.status)}>{item.status}</span></td>
                  <td>{ago(item.createdAt)}</td>
                </tr>
              ))}
              {!data ? <SkeletonRows cols={6} /> : null}
              {data && data.items.length === 0 ? <tr><td colSpan={6} className="empty">No feedback matches these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="u-pager">
          <nav className="pager" aria-label="Pages">
            <button className="pager-step" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((n) => (
              <button key={n} className={`pager-n${n === page ? ' on' : ''}`} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
            ))}
            <button className="pager-step" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
          <span className="u-count">Showing {from_.toLocaleString()}–{to_.toLocaleString()} of {(data?.total ?? 0).toLocaleString()}</span>
        </div>
      </section>

      {open ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="Feedback">
            <div className="modal-head">
              <div>
                <h2>{open.title || (open.category === 'suggestion' ? 'Suggestion' : 'Feedback')}</h2>
                <p>{open.user ? `${open.user.name} · ${open.user.mobile}` : 'Anonymous'} · {ago(open.createdAt)}{open.appVersion ? ` · app ${open.appVersion}` : ''}{open.platform ? ` · ${open.platform}` : ''}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="fb-tags">
                <span className="badge draft">{open.category}</span>
                {open.printerName ? <span className="badge">{open.printerName}</span> : null}
                {open.rating != null ? fill(open.rating) : null}
                <span className={statusBadge(open.status)}>{open.status}</span>
              </div>
              <p className="fb-full">{open.message ?? <em className="u-muted">No message body.</em>}</p>
              {canEdit ? (
                <>
                  <label className="lib-label">Note for the team
                    <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only admins see this" />
                  </label>
                </>
              ) : open.adminNote ? <div className="note">Admin note: {open.adminNote}</div> : null}
            </div>
            {canEdit ? (
              <div className="modal-foot">
                <div className="seg" role="group" aria-label="Set status">
                  {['new', 'reviewed', 'resolved'].map((st) => (
                    <button key={st} type="button" className={open.status === st ? 'on' : ''} onClick={() => save(open, { status: st })}>{st[0].toUpperCase() + st.slice(1)}</button>
                  ))}
                </div>
                <span style={{ flex: 1 }} />
                <button className="btn primary" disabled={note === (open.adminNote ?? '')} onClick={() => save(open, { adminNote: note })}>Save note</button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
