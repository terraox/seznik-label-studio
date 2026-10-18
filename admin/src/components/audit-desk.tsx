'use client';

import { useEffect, useState } from 'react';

import { useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ago } from '@/lib/format';

type Entry = { id: string; adminEmail: string; action: string; targetType: string; targetId: string; before: unknown; after: unknown; ip: string | null; createdAt: string };

export function AuditDesk() {
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api<{ entries: Entry[]; total: number }>(`/api/audit?page=${page}`)
      .then((r) => {
        setEntries(r.entries);
        setTotal(r.total);
      })
      .catch((reason: Error) => toast(reason.message, 'bad'));
  }, [page, toast]);

  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <>
      <PageHeader kicker="Security" title="Audit log" lede="Every block, unblock, sign-out, config change and export, with who did it. Owners only." />
      <section className="panel">
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Change</th></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td title={entry.createdAt}>{ago(entry.createdAt)}</td>
                  <td>{entry.adminEmail}</td>
                  <td>{entry.action}</td>
                  <td>{entry.targetType} {entry.targetId.slice(0, 14)}</td>
                  <td><code style={{ fontSize: 12 }}>{entry.after ? JSON.stringify(entry.after).slice(0, 120) : ''}</code></td>
                </tr>
              ))}
              {entries.length === 0 ? <tr><td colSpan={5}>Nothing recorded yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </section>
    </>
  );
}
