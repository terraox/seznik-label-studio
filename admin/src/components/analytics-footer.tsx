'use client';

import { CalendarClock, Info, Smartphone } from 'lucide-react';

import { ago } from '@/lib/format';

export type FooterInfo = {
  trackingSince: string | null;
  countedAs: string;
  appVersions: { version: string; users: number; percent: number }[];
};

const SHADES = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#94a3b8'];

/** Shown under every analytics screen so the numbers are read correctly. */
export function AnalyticsFooter({ footer }: { footer: FooterInfo | null | undefined }) {
  if (!footer) return null;
  const versions = footer.appVersions;
  return (
    <section className="foot-grid" aria-label="About these numbers">
      <article className="foot-card">
        <span className="foot-icon"><CalendarClock size={15} /></span>
        <div>
          <h3>Tracking since</h3>
          {footer.trackingSince ? (
            <>
              <p className="foot-big">{new Date(footer.trackingSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
              <p>{ago(footer.trackingSince)} · earlier prints are not counted.</p>
            </>
          ) : (
            <>
              <p className="foot-big">Waiting for the first print</p>
              <p>Numbers appear once a phone sends its first label.</p>
            </>
          )}
        </div>
      </article>

      <article className="foot-card">
        <span className="foot-icon"><Info size={15} /></span>
        <div>
          <h3>What is counted</h3>
          <p className="foot-big">Labels sent to the printer</p>
          <p>Confirmed hand-off to a connected printer, not paper physically printed.</p>
        </div>
      </article>

      <article className="foot-card">
        <span className="foot-icon"><Smartphone size={15} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>App versions</h3>
          {versions.length === 0 ? (
            <p>No users yet.</p>
          ) : (
            <>
              <div className="mix" aria-hidden>
                {versions.map((v, i) => <span key={v.version} style={{ width: `${Math.max(v.percent, 2)}%`, background: SHADES[i % SHADES.length] }} />)}
              </div>
              <ul className="ver-list">
                {versions.map((v, i) => (
                  <li key={v.version}>
                    <i style={{ background: SHADES[i % SHADES.length] }} />
                    <span>{v.version === 'Older build' ? 'Older build (version not reported)' : `v${v.version}`}</span>
                    <b>{v.percent}%</b>
                    <small>{v.users} user{v.users === 1 ? '' : 's'}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </article>
    </section>
  );
}
