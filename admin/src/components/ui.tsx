'use client';

import { useEffect, useRef } from 'react';

export function PageHeader({
  kicker,
  title,
  lede,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="lede">{lede}</p>
      </div>
      {children ? <div className="page-actions">{children}</div> : null}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em className="err">{error}</em> : hint ? <em className="hint">{hint}</em> : null}
    </label>
  );
}

export function Drawer({
  title,
  lede,
  onClose,
  children,
}: {
  title: string;
  lede?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <button className="drawer-back" aria-label="Close" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <button ref={closeRef} type="button" className="btn small" onClick={onClose}>Close</button>
        <h2 id="drawer-title">{title}</h2>
        {lede ? <p className="lede">{lede}</p> : null}
        {children}
      </aside>
    </>
  );
}

/**
 * The panel's loader: a printer slot feeding out a label whose lines print one by one.
 * `compact` is the small inline version for panels and drawers.
 */
export function Loader({ label = 'Loading', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'ld compact' : 'ld'} role="status" aria-live="polite">
      <div className="ld-art" aria-hidden>
        <span className="ld-feed">
          <span className="ld-tag">
            <i />
            <i />
            <i />
          </span>
        </span>
        <span className="ld-slot" />
      </div>
      <span className="ld-text">{label}…</span>
    </div>
  );
}

/** A shimmering placeholder bar the size of the text or number that is on its way. */
export function Skeleton({ width = '100%', height = 10, round = false }: { width?: number | string; height?: number; round?: boolean }) {
  return <span className={round ? 'skel round' : 'skel'} style={{ width, height }} aria-hidden />;
}

// Varied widths so placeholder rows read as text, not as a grid of identical bars.
const ROW_WIDTHS = ['72%', '48%', '60%', '36%', '54%', '42%', '66%'];

/** Placeholder rows for a table that is loading. */
export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skel-row" aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}><Skeleton width={ROW_WIDTHS[(r + c * 3) % ROW_WIDTHS.length]} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Placeholder cards for the template / clipart grid. */
export function SkeletonCards({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="lib-card skel-card" aria-hidden>
          <span className="skel skel-thumb" />
          <span className="lib-info">
            <Skeleton width={ROW_WIDTHS[i % ROW_WIDTHS.length]} height={12} />
            <Skeleton width="40%" height={9} />
          </span>
        </div>
      ))}
    </>
  );
}
