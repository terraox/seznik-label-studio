'use client';

import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Database, Server, XCircle } from 'lucide-react';
import { useToast } from '@/components/desk';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/client';

type DbCheck = { warmUpMs: number; samples: number[]; minMs: number; maxMs: number; avgMs: number; medianMs: number; readMs: number; checkedAt: string };

type BackendHealth = {
  ok: boolean;
  checkedAt: string;
  server: { environment: string; node: string; uptimeSec: number; memoryUsedMb: number; memoryTotalMb: number; loadAvg1m: number; cpus: number };
  database: { ok: boolean; host: string; pingMs: number };
  dataDisk: { writable: boolean; freeMb: number; totalMb: number };
  config: { secretsOk: boolean; smsConfigured: boolean; apiUrl: string };
};

function uptimeText(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div><dt>{label}</dt><dd style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {ok ? <CheckCircle2 size={14} color="#10B981" /> : <XCircle size={14} color="#EF4444" />}{ok ? 'OK' : 'Problem'}
    </dd></div>
  );
}

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
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [roundTrip, setRoundTrip] = useState<number | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  async function checkBackend() {
    setHealthBusy(true);
    try {
      const start = performance.now();
      const result = await api<BackendHealth>('/api/desk/backend-health');
      setRoundTrip(Math.round(performance.now() - start));
      setHealth(result);
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not check the backend', 'bad');
    } finally {
      setHealthBusy(false);
    }
  }

  useEffect(() => {
    void checkBackend();
    // Refresh every 60 s while the tab is visible.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void checkBackend();
    }, 60_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <div><h2>Backend health</h2><p>Server, database link, storage and configuration. Refreshes every minute.</p></div>
          </div>
          {health ? (
            <>
              <div className="latency-main">
                <b>{roundTrip}<small> ms</small></b>
                <span className={health.ok ? 'badge shipped' : 'badge rejected'}>{health.ok ? 'Healthy' : 'Needs attention'}</span>
              </div>
              <dl className="latency-stats">
                <Check ok={health.database.ok} label="Database" />
                <Check ok={health.dataDisk.writable} label="Data folder writable" />
                <Check ok={health.config.secretsOk} label="Secrets" />
                <Check ok={health.config.smsConfigured} label="SMS (MSG91)" />
                <div><dt>Database host</dt><dd>{health.database.host}</dd></div>
                <div><dt>Database ping</dt><dd>{health.database.pingMs} ms</dd></div>
                <div><dt>Uptime</dt><dd>{uptimeText(health.server.uptimeSec)}</dd></div>
                <div><dt>Memory</dt><dd>{health.server.memoryUsedMb} of {health.server.memoryTotalMb} MB</dd></div>
                <div><dt>CPU load (1 min)</dt><dd>{health.server.loadAvg1m} on {health.server.cpus} cores</dd></div>
                <div><dt>Data disk free</dt><dd>{(health.dataDisk.freeMb / 1024).toFixed(1)} GB</dd></div>
                <div><dt>Environment</dt><dd>{health.server.environment} · node {health.server.node}</dd></div>
                <div><dt>API address</dt><dd>{health.config.apiUrl}</dd></div>
              </dl>
              <p className="meta">Checked {new Date(health.checkedAt).toLocaleTimeString('en-IN')}. The big number is the time from this browser to the server and back.</p>
            </>
          ) : <p className="meta">Checking…</p>}
          <button type="button" className="btn primary" disabled={healthBusy} onClick={checkBackend}><Activity size={14} /> {healthBusy ? 'Checking…' : 'Check backend now'}</button>
        </article>
      </section>

    </>
  );
}
