import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import {
  fetchAccessCodeIssuers,
  fetchAccessCodes,
  lookupAdminAccessCode,
} from '../services/api';
import type { AccessCodeIssuerStat, AccessCodeRecord } from '../types/admin';
import { CodeSearchModal } from './CodeSearchModal';

const controlStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}

interface SupportCodeIssuanceLedgerProps {
  onBack?: () => void;
}

export const SupportCodeIssuanceLedger: React.FC<SupportCodeIssuanceLedgerProps> = ({ onBack }) => {
  const [issuers, setIssuers] = useState<AccessCodeIssuerStat[]>([]);
  const [entries, setEntries] = useState<AccessCodeRecord[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssuer, setSelectedIssuer] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedSearchCode, setSelectedSearchCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const codesRes = await fetchAccessCodes({
        page: 1,
        limit: 200,
        customerOnly: true,
        createdBy: selectedIssuer === 'all' ? undefined : selectedIssuer,
        search: search.trim() || undefined,
      });
      setEntries(codesRes.items);
      setEntriesTotal(codesRes.total);

      try {
        const issuerRes = await fetchAccessCodeIssuers();
        setIssuers(issuerRes.items);
      } catch {
        // Fallback if /access-codes/issuers is missing on an older deploy
        const byUser = new Map<string, AccessCodeIssuerStat>();
        for (const row of codesRes.items) {
          const key = row.createdBy || 'unknown';
          const prev = byUser.get(key);
          if (!prev) {
            byUser.set(key, { createdBy: key, count: 1, lastGeneratedAt: row.createdAt });
          } else {
            prev.count += 1;
            if (row.createdAt > prev.lastGeneratedAt) prev.lastGeneratedAt = row.createdAt;
          }
        }
        setIssuers([...byUser.values()].sort((a, b) => b.count - a.count));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load issuance ledger');
    } finally {
      setLoading(false);
    }
  }, [selectedIssuer, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-page-stack" style={{ gap: '16px' }}>
      {onBack ? (
        <div>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} /> Back to Support Access
          </button>
        </div>
      ) : null}

      <section
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>View reports</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Who generated how many codes, and every customer entry from the support portal
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href="/support"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.74rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={13} /> Open support portal
            </a>
            <button
              type="button"
              onClick={() => {
                setSearch(searchDraft);
                void load();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        <div
          style={{
            overflow: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 10,
            width: 'fit-content',
            maxWidth: '100%',
          }}
        >
          <table style={{ width: 'auto', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                  Generated by
                </th>
                <th style={{ textAlign: 'right', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                  Codes
                </th>
                <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                  Last issued
                </th>
                <th style={{ textAlign: 'right', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                  Filter
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && issuers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '16px 14px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <Loader2 size={14} className="spin" style={{ display: 'inline', marginRight: 8 }} />
                    Loading issuers…
                  </td>
                </tr>
              ) : issuers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '16px 14px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <Users size={16} style={{ display: 'inline', marginRight: 8, opacity: 0.5 }} />
                    No customer codes issued yet
                  </td>
                </tr>
              ) : (
                issuers.map((row) => (
                  <tr key={row.createdBy}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {row.createdBy}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {row.count.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                      {formatWhen(row.lastGeneratedAt)}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedIssuer(row.createdBy)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border-color)',
                          background: selectedIssuer === row.createdBy ? 'var(--accent-blue)' : 'var(--bg-main)',
                          color: selectedIssuer === row.createdBy ? '#fff' : 'var(--text-main)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>Entries</h4>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {entriesTotal} entr{entriesTotal === 1 ? 'y' : 'ies'}
              {selectedIssuer !== 'all' ? ` · filtered by ${selectedIssuer}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              style={{ ...controlStyle, width: 'auto', minWidth: 140 }}
              value={selectedIssuer}
              onChange={(e) => setSelectedIssuer(e.target.value)}
            >
              <option value="all">All support users</option>
              {issuers.map((i) => (
                <option key={i.createdBy} value={i.createdBy}>
                  {i.createdBy} ({i.count})
                </option>
              ))}
            </select>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                style={{ ...controlStyle, paddingLeft: 32, width: 200 }}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearch(searchDraft);
                }}
                placeholder="Search entries…"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSearchCode('');
                setSearchModalOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--accent-blue, #2563eb)',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Search size={13} /> Search Code
            </button>
          </div>
        </div>

        <div style={{ overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 10, maxHeight: 420 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', position: 'sticky', top: 0, zIndex: 1 }}>
                {[
                  'Shop / Business name',
                  'ID',
                  'Invoice',
                  'Phone',
                  'Printer',
                  'Code',
                  'Status',
                  'Generated by',
                  'When',
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border-color)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={14} className="spin" style={{ display: 'inline', marginRight: 8 }} />
                    Loading entries…
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No matching entries
                  </td>
                </tr>
              ) : (
                entries.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                      {row.customerName || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      {row.customerId || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      {row.invoiceNumber || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      {row.phone || '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={row.printer || undefined}
                    >
                      {row.printer || '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSearchCode(row.code);
                          setSearchModalOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--accent-blue, #2563eb)',
                          fontFamily: 'inherit',
                          fontWeight: 'inherit',
                          letterSpacing: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: '2px',
                        }}
                        title="Click to view code & redemption details"
                      >
                        {row.code}
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                      {row.isUsed ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSearchCode(row.code);
                            setSearchModalOpen(true);
                          }}
                          title={`Redeemed by ${row.customerEmail || row.usedByUserId || 'User'}${row.usedAt ? ` on ${formatWhen(row.usedAt)}` : ''}. Click to view details.`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#059669',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Redeemed
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSearchCode(row.code);
                            setSearchModalOpen(true);
                          }}
                          title="Available / Pending redemption. Click to view details."
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#2563eb',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            cursor: 'pointer',
                          }}
                        >
                          Available
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      {row.createdBy || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                      {formatWhen(row.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CodeSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchFn={lookupAdminAccessCode}
        initialCode={selectedSearchCode}
        title="Search Access Code"
      />
    </div>
  );
};
