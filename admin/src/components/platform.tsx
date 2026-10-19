'use client';

export function platformKind(value: string | null | undefined): 'android' | 'ios' | 'web' | null {
  const v = (value ?? '').toLowerCase();
  if (v.includes('android')) return 'android';
  if (v === 'web') return 'web';
  if (v === 'ios' || v.includes('iphone') || v.includes('ipad') || v.includes('apple')) return 'ios';
  return null;
}

/** Android / iOS tag. */
export function PlatformTag({ value }: { value: string | null | undefined }) {
  const kind = platformKind(value);
  if (!kind) return <span className="u-muted">{value ?? '—'}</span>;
  return <span className={`ptag ${kind}`}>{kind === 'android' ? 'Android' : kind === 'ios' ? 'iOS' : 'Web'}</span>;
}

/** Users per platform, as a card for the overview. */
export function PlatformCard({ platforms }: { platforms: { platform: string | null; users: number }[] | undefined }) {
  const rows = [...(platforms ?? [])].sort((a, b) => b.users - a.users);
  const total = rows.reduce((sum, p) => sum + p.users, 0);
  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <div className="chart-head">
        <div>
          <h2>Platforms</h2>
          <p className="chart-sum"><b>{total.toLocaleString()}</b> <span>user{total === 1 ? '' : 's'} by phone type</span></p>
        </div>
      </div>
      <div className="plat-grid">
        {rows.map((p) => {
          const pct = total ? Math.round((p.users / total) * 100) : 0;
          const kind = platformKind(p.platform);
          return (
            <div key={p.platform ?? 'none'} className="plat-row">
              <div className="plat-top"><PlatformTag value={p.platform ?? 'Not reported'} /><b>{p.users.toLocaleString()}</b><small>{pct}%</small></div>
              <div className="rank-bar"><i style={{ width: `${Math.max(pct, 2)}%`, background: kind === 'ios' ? 'linear-gradient(90deg,#64748b,#94a3b8)' : kind === 'android' ? 'linear-gradient(90deg,#10b981,#34d399)' : undefined }} /></div>
            </div>
          );
        })}
        {rows.length === 0 ? <p className="empty">No users yet.</p> : null}
      </div>
    </section>
  );
}
