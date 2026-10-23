'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Inbox, Search, X, XCircle } from 'lucide-react';

import { useDesk, useHideInternal, useToast } from '@/components/desk';
import { PageHeader, Skeleton, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type Status = 'new' | 'in_progress' | 'done' | 'declined';
type Item = {
  id: string; description: string; widthMm: number | null; heightMm: number | null; shape: string | null;
  searchText: string | null; status: Status; adminNote: string | null; appVersion: string | null; platform: string | null;
  createdAt: string; user: { name: string; mobile: string } | null;
};
type Data = { total: number; page: number; pageSize: number; counts: Record<Status, number>; items: Item[] };

const STATUS_LABEL: Record<Status, string> = { new: 'New', in_progress: 'In progress', done: 'Done', declined: 'Declined' };
const statusBadge = (st: Status) => (st === 'done' ? 'badge shipped' : st === 'in_progress' ? 'badge reviewing' : st === 'declined' ? 'badge draft' : 'badge');
const size = (item: Item) => (item.widthMm && item.heightMm ? `${item.widthMm} × ${item.heightMm} mm` : item.widthMm || item.heightMm ? `${item.widthMm ?? '?'} × ${item.heightMm ?? '?'} mm` : null);

export function TemplateRequestsDesk() {
  const desk = useDesk();
  const toast = useToast();
  const canEdit = can(desk.role, 'catalog.edit');
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [hideInternal] = useHideInternal();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Item | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (hideInternal) params.set('internal', 'hide');
    api<Data>(`/api/template-requests?${params}`).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, [page, status, q, hideInternal]);

  useEffect(() => {
    const timer = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  async function save(item: Item, patch: { status?: Status; adminNote?: string }) {
    try {
      await api(`/api/template-requests/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      toast('Saved');
      setOpen((cur) => (cur && cur.id === item.id ? { ...cur, ...patch, adminNote: patch.adminNote ?? cur.adminNote } : cur));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save', 'bad');
    }
  }

  const counts = data?.counts;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const from_ = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const to_ = data ? Math.min(page * data.pageSize, data.total) : 0;
  const kpis = [
    { key: 'new', title: 'New', sub: 'not looked at yet', Icon: Inbox, color: '#3B82F6' },
    { key: 'in_progress', title: 'In progress', sub: 'being designed', Icon: Clock3, color: '#F59E0B' },
    { key: 'done', title: 'Done', sub: 'added to the catalogue', Icon: CheckCircle2, color: '#10B981' },
    { key: 'declined', title: 'Declined', sub: 'not added', Icon: XCircle, color: '#94A3B8' },
  ] as const;

  return (
    <>
      <PageHeader kicker="Templates" title="Template requests" lede="What people asked for from “Can’t find your template?” in the app: what the label is for, its size and shape, and what they searched.">
        <button type="button" className="btn ghost" onClick={load}>Refresh</button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Requests by status">
        {kpis.map(({ key, title, sub, Icon, color }) => (
          <article className="kpi" key={key} onClick={() => reset(setStatus)(status === key ? '' : key)} style={{ cursor: 'pointer' }}>
            <div className="kpi-top">
              <span className="kpi-title">{title}</span>
              <span className="kpi-icon" style={{ background: `${color}20`, border: `1px solid ${color}40` }}><Icon size={16} color={color} /></span>
            </div>
            <div className="kpi-value">{counts ? counts[key].toLocaleString() : <Skeleton />}</div>
            <div className="kpi-sub">{sub}</div>
          </article>
        ))}
      </section>

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input type="search" placeholder="Search request, search text or name…" value={q} onChange={(e) => reset(setQ)(e.target.value)} aria-label="Search" />
            {q ? <button type="button" className="u-clear" onClick={() => reset(setQ)('')} aria-label="Clear search"><X size={14} /></button> : null}
          </div>
          <div className="seg" role="group" aria-label="Status">
            {([['', 'All'], ...Object.entries(STATUS_LABEL)] as [string, string][]).map(([v, label]) => (
              <button key={v} type="button" className={status === v ? 'on' : ''} onClick={() => reset(setStatus)(v)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="u-scroll">
          <table className="table u-table">
            <thead><tr><th>Request</th><th>Size</th><th>Shape</th><th>Searched for</th><th>From</th><th>Status</th><th>Received</th></tr></thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id} className="u-row" onClick={() => { setOpen(item); setNote(item.adminNote ?? ''); }}>
                  <td className="fb-msg"><span>{item.description}</span>{item.adminNote ? <small className="u-id">Note: {item.adminNote}</small> : null}</td>
                  <td>{size(item) ?? <span className="u-muted">—</span>}</td>
                  <td>{item.shape ? <span className="badge draft">{item.shape}</span> : <span className="u-muted">—</span>}</td>
                  <td>{item.searchText ? `“${item.searchText}”` : <span className="u-muted">—</span>}</td>
                  <td>{item.user ? <div className="u-printer"><b>{item.user.name}</b><small>{item.user.mobile}</small></div> : <span className="u-muted">Hidden</span>}</td>
                  <td><span className={statusBadge(item.status)}>{STATUS_LABEL[item.status]}</span></td>
                  <td>{ago(item.createdAt)}</td>
                </tr>
              ))}
              {!data ? <SkeletonRows cols={7} /> : null}
              {data && data.items.length === 0 ? <tr><td colSpan={7} className="empty">No requests match these filters.</td></tr> : null}
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
          <div className="modal" role="dialog" aria-modal="true" aria-label="Template request">
            <div className="modal-head">
              <div>
                <h2>Template request</h2>
                <p>{open.user ? `${open.user.name} · ${open.user.mobile}` : 'Sender hidden'} · {ago(open.createdAt)}{open.appVersion ? ` · app ${open.appVersion}` : ''}{open.platform ? ` · ${open.platform}` : ''}</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="fb-tags">
                <span className={statusBadge(open.status)}>{STATUS_LABEL[open.status]}</span>
                {size(open) ? <span className="badge draft">{size(open)}</span> : null}
                {open.shape ? <span className="badge draft">{open.shape}</span> : null}
              </div>
              <p className="fb-full">{open.description}</p>
              {open.searchText ? <p className="u-muted">Searched for “{open.searchText}” before asking.</p> : null}
              {canEdit ? (
                <label className="lib-label">Note for the team
                  <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only admins see this" />
                </label>
              ) : open.adminNote ? <div className="note">Admin note: {open.adminNote}</div> : null}
            </div>
            {canEdit ? (
              <div className="modal-foot">
                <div className="seg" role="group" aria-label="Set status">
                  {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
                    <button key={st} type="button" className={open.status === st ? 'on' : ''} onClick={() => save(open, { status: st })}>{STATUS_LABEL[st]}</button>
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
