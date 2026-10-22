'use client';

import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Search, X } from 'lucide-react';

import { useHideInternal, useToast } from '@/components/desk';
import { api } from '@/lib/client';
import type { AdminUserDto } from '@/lib/user-dto';

/** Switch that leaves test / internal accounts out of the numbers, plus a window to mark which accounts they are. */
export function TestAccounts({
  count,
  onChanged,
}: {
  count: number | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hide, onHide] = useHideInternal();
  return (
    <>
      <div className={`test-switch${hide ? ' is-on' : ''}`}>
        <button type="button" role="switch" aria-checked={hide} className="switch" onClick={() => onHide(!hide)} aria-label="Exclude test and internal accounts">
          <i />
        </button>
        <div className="test-switch-text">
          <b>Exclude test accounts</b>
          <span>{count === undefined ? '…' : `${count} account${count === 1 ? '' : 's'} marked`}</span>
        </div>
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          <FlaskConical size={13} /> Manage
        </button>
      </div>
      {open ? <ManageDialog onClose={() => setOpen(false)} onChanged={onChanged} /> : null}
    </>
  );
}

function ManageDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '12', sort: 'printCountTotal', dir: 'desc' });
    if (q.trim()) params.set('q', q.trim());
    if (only) params.set('internal', 'only');
    api<{ users: AdminUserDto[] }>(`/api/users?${params}`)
      .then((d) => setUsers(d.users))
      .catch((e: Error) => toast(e.message, 'bad'));
  }, [q, only, toast]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function flip(user: AdminUserDto) {
    setBusy(user.id);
    try {
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isInternal: !user.isInternal }) });
      setUsers((rows) => rows.map((r) => (r.id === user.id ? { ...r, isInternal: !user.isInternal } : r)));
      onChanged();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not save', 'bad');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button className="drawer-back" aria-label="Close" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Test and internal accounts">
        <div className="modal-head">
          <div>
            <h2>Test &amp; internal accounts</h2>
            <p>Marked accounts are left out of totals, charts and rankings while the switch is on.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-tools">
          <label className="modal-search">
            <Search size={14} />
            <input placeholder="Search by name or mobile" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </label>
          <div className="seg">
            <button type="button" className={only ? '' : 'on'} onClick={() => setOnly(false)}>All</button>
            <button type="button" className={only ? 'on' : ''} onClick={() => setOnly(true)}>Marked</button>
          </div>
        </div>
        <ul className="modal-list">
          {users.map((u) => (
            <li key={u.id}>
              <div>
                <b>{u.name}</b>
                <span>{u.mobile} · {u.printCountTotal.toLocaleString()} labels</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={u.isInternal}
                className={`switch${u.isInternal ? ' on' : ''}`}
                disabled={busy === u.id}
                onClick={() => flip(u)}
                aria-label={`Mark ${u.name} as test account`}
              ><i /></button>
            </li>
          ))}
          {users.length === 0 ? <li className="modal-empty">No accounts found.</li> : null}
        </ul>
      </div>
    </>
  );
}
