'use client';

import { useState } from 'react';
import { Activity, Database, Server } from 'lucide-react';
import { useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

type DbCheck = { warmUpMs: number; samples: number[]; minMs: number; maxMs: number; avgMs: number; medianMs: number; readMs: number; checkedAt: string };

/** Plain-language verdict for a database round trip. */
function verdict(ms: number) {
  if (ms < 40) return { label: 'Fast', cls: 'badge shipped' };
  if (ms < 120) return { label: 'Normal', cls: 'badge reviewing' };
  return { label: 'Slow', cls: 'badge rejected' };
}

export function SettingsDesk() {
  const toast = useToast();
  const [db, setDb] = useState<DbCheck | null>(null);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbRuns, setDbRuns] = useState<number[]>([]);

  async function checkDb() {
    setDbBusy(true);
    try {
      const result = await api<DbCheck>('/api/desk/db-latency');
      setDb(result);
      setDbRuns((runs) => [...runs, result.avgMs].slice(-12));
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not check the database', 'bad');
    } finally {
      setDbBusy(false);
    }
  }

  return (
    <>
      <PageHeader kicker="System" title="Settings" lede="Health checks for the database and the backend." />
      <section className="latency-grid" aria-label="Latency checks">
        <article className="panel latency-card">
          <div className="latency-head">
            <span className="kpi-icon" style={{ background: '#10B98120', border: '1px solid #10B98140' }}><Database size={16} color="#10B981" /></span>
            <div><h2>Database latency</h2><p>Time for this server to reach the database and get an answer.</p></div>
          </div>
          {db ? (
            <>
              <div className="latency-main">
                <b>{db.avgMs}<small> ms</small></b>
                <span className={verdict(db.avgMs).cls}>{verdict(db.avgMs).label}</span>
              </div>
              <dl className="latency-stats">
                <div><dt>Fastest</dt><dd>{db.minMs} ms</dd></div>
                <div><dt>Median</dt><dd>{db.medianMs} ms</dd></div>
                <div><dt>Slowest</dt><dd>{db.maxMs} ms</dd></div>
                <div><dt>First query</dt><dd>{db.warmUpMs} ms</dd></div>
                <div><dt>Small read</dt><dd>{db.readMs} ms</dd></div>
              </dl>
              <div className="latency-bars" aria-label="Each query">
                {db.samples.map((ms, i) => <i key={i} title={`${ms} ms`} style={{ height: `${Math.max(8, (ms / Math.max(db.maxMs, 1)) * 100)}%` }} />)}
              </div>
              {dbRuns.length > 1 ? <p className="meta">Average of each run this visit: {dbRuns.join(' · ')} ms</p> : <p className="meta">Checked {new Date(db.checkedAt).toLocaleTimeString('en-IN')}</p>}
            </>
          ) : <p className="meta">Not checked yet. It runs 7 tiny queries and one small read.</p>}
          <button type="button" className="btn primary" disabled={dbBusy} onClick={checkDb}><Activity size={14} /> {dbBusy ? 'Checking…' : db ? 'Check again' : 'Check database latency'}</button>
        </article>

        <article className="panel latency-card">
          <div className="latency-head">
            <span className="kpi-icon" style={{ background: '#3B82F620', border: '1px solid #3B82F640' }}><Server size={16} color="#3B82F6" /></span>
            <div><h2>Backend latency</h2><p>Time for an app request to reach the API and come back.</p></div>
          </div>
          <p className="meta">Coming soon.</p>
          <button type="button" className="btn" disabled><Activity size={14} /> Check backend latency</button>
        </article>
      </section>

    </>
  );
}
