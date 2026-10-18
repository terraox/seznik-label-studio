'use client';

import { ago } from '@/lib/format';

export type FooterInfo = {
  trackingSince: string | null;
  countedAs: string;
  appVersions: { version: string; users: number; percent: number }[];
};

/** Shown under every analytics screen so the numbers are read correctly. */
export function AnalyticsFooter({ footer }: { footer: FooterInfo | null | undefined }) {
  if (!footer) return null;
  return (
    <footer className="note" style={{ marginTop: 14, fontSize: '0.8rem', lineHeight: 1.6 }}>
      <div>
        <strong>Tracking since</strong>{' '}
        {footer.trackingSince
          ? `${new Date(footer.trackingSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })} (${ago(footer.trackingSince)}). Earlier prints are not in these numbers.`
          : 'no events received yet.'}
      </div>
      <div><strong>Counted as:</strong> {footer.countedAs}</div>
      <div>
        <strong>App versions:</strong>{' '}
        {footer.appVersions.length === 0
          ? 'no users yet'
          : footer.appVersions.map((v) => `${v.version} ${v.percent}% (${v.users})`).join(' · ')}
      </div>
    </footer>
  );
}
