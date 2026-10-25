'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Trash2, UserX, X } from 'lucide-react';

import { useDesk, useHideInternal } from '@/components/desk';
import { PageHeader, SkeletonRows } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';
import { can } from '@/lib/permissions';

type Item = {
  id: string;
  formerUserId: string;
  name: string;
  mobile: string;
  printerName: string | null;
  labelsPrinted: number;
  reason: string;
  registeredAt: string | null;
  deletedAt: string;
  isInternal: boolean;
  appVersion: string | null;
  platform: string | null;
};

type Data = { total: number; page: number; pageSize: number; items: Item[] };

export function DeletedAccountsDesk() {
  const desk = useDesk();
  const seePhones = can(desk.role, 'users.phones');
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hideInternal] = useHideInternal();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Item | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q.trim()) params.set('q', q.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (hideInternal) params.set('internal', 'hide');
    api<Data>(`/api/deleted-accounts?${params}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, [page, q, from, to, hideInternal]);

  useEffect(() => {
    const timer = window.setTimeout(load, q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const from_ = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const to_ = data ? Math.min(page * data.pageSize, data.total) : 0;

  return (
    <>
      <PageHeader
        kicker="Users"
        title="Deleted accounts"
        lede="People who removed their account from the app. Name, phone, printer, labels printed, and their reason are kept here; the live account and related personal rows are gone."
      >
        <button type="button" className="btn ghost" onClick={load}>
          Refresh
        </button>
      </PageHeader>
      {error ? <p className="err">{error}</p> : null}

      <section className="kpis" aria-label="Deletion summary">
        <article className="kpi">
          <div className="kpi-top">
            <span className="kpi-title">Deleted accounts</span>
            <span className="kpi-icon" style={{ background: '#EF444420', border: '1px solid #EF444440' }}>
              <UserX size={16} color="#EF4444" />
            </span>
          </div>
          <div className="kpi-value">{data ? data.total.toLocaleString() : '…'}</div>
          <div className="kpi-sub">archived with a reason</div>
        </article>
        <article className="kpi">
          <div className="kpi-top">
            <span className="kpi-title">On this page</span>
            <span className="kpi-icon" style={{ background: '#64748B20', border: '1px solid #64748B40' }}>
              <Trash2 size={16} color="#64748B" />
            </span>
          </div>
          <div className="kpi-value">{data ? data.items.length.toLocaleString() : '…'}</div>
          <div className="kpi-sub">newest first</div>
        </article>
      </section>

      <section className="panel users-panel">
        <div className="u-toolbar">
          <div className="u-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder={seePhones ? 'Search name, reason, phone…' : 'Search name or reason…'}
              value={q}
              onChange={(e) => reset(setQ)(e.target.value)}
              aria-label="Search"
            />
            {q ? (
              <button type="button" className="u-clear" onClick={() => reset(setQ)('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <input
            className="u-select"
            type="date"
            value={from}
            onChange={(e) => reset(setFrom)(e.target.value)}
            aria-label="From date"
          />
          <input
            className="u-select"
            type="date"
            value={to}
            onChange={(e) => reset(setTo)(e.target.value)}
            aria-label="To date"
          />
        </div>

        <div className="u-scroll">
          <table className="table u-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Printer</th>
                <th>Labels</th>
                <th>Reason</th>
                <th>Deleted</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr
                  key={item.id}
                  className="u-row"
                  onClick={() => setOpen(item)}
                >
                  <td>
                    <div className="u-printer">
                      <b>{item.name}</b>
                      {item.isInternal ? <small className="u-id">Test account</small> : null}
                    </div>
                  </td>
                  <td>{item.mobile}</td>
                  <td>
                    {item.printerName ? (
                      <span className="badge">{item.printerName}</span>
                    ) : (
                      <span className="u-muted">—</span>
                    )}
                  </td>
                  <td>{item.labelsPrinted.toLocaleString()}</td>
                  <td className="fb-msg">
                    <span>{item.reason}</span>
                  </td>
                  <td>{ago(item.deletedAt)}</td>
                </tr>
              ))}
              {!data ? <SkeletonRows cols={6} /> : null}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    No deleted accounts match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="u-pager">
          <nav className="pager" aria-label="Pages">
            <button
              className="pager-step"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .slice(Math.max(0, page - 3), page + 2)
              .map((n) => (
                <button
                  key={n}
                  className={`pager-n${n === page ? ' on' : ''}`}
                  onClick={() => setPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </button>
              ))}
            <button
              className="pager-step"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </nav>
          <span className="u-count">
            Showing {from_.toLocaleString()}–{to_.toLocaleString()} of {(data?.total ?? 0).toLocaleString()}
          </span>
        </div>
      </section>

      {open ? (
        <>
          <button className="drawer-back" aria-label="Close" onClick={() => setOpen(null)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="Deleted account">
            <div className="modal-head">
              <div>
                <h2>{open.name}</h2>
                <p>
                  {open.mobile} · deleted {ago(open.deletedAt)}
                  {open.appVersion ? ` · app ${open.appVersion}` : ''}
                  {open.platform ? ` · ${open.platform}` : ''}
                </p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="fb-tags">
                {open.printerName ? <span className="badge">{open.printerName}</span> : null}
                <span className="badge">{open.labelsPrinted.toLocaleString()} labels</span>
                {open.isInternal ? <span className="badge draft">Test account</span> : null}
              </div>
              <p className="fb-full">{open.reason}</p>
              <div className="note" style={{ marginTop: 12 }}>
                Former user id: {open.formerUserId}
                {open.registeredAt
                  ? ` · Registered ${new Date(open.registeredAt).toLocaleDateString('en-IN')}`
                  : ''}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
