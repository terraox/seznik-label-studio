import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Headphones,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AnimatedThemeToggler } from '../components/AnimatedThemeToggler';
import { CodeSearchModal } from '../components/CodeSearchModal';
import {
  fetchSupportAccessCodes,
  issueSupportAccessCode,
  lookupSupportAccessCode,
  logoutSupport,
} from '../services/api';
import type { AccessCodeRecord, SupportAgentRecord } from '../types/admin';
import { getSupportPrinterOptions } from '../utils/supportPrinters';

const controlStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.84rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const emptyForm = {
  customerName: '',
  customerId: '',
  invoiceNumber: '',
  phone: '',
  printer: '',
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

interface SupportPortalAppProps {
  agent: SupportAgentRecord;
  onLogout: () => void;
}

export const SupportPortalApp: React.FC<SupportPortalAppProps> = ({ agent, onLogout }) => {
  const printers = useMemo(() => getSupportPrinterOptions(), []);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastIssued, setLastIssued] = useState<AccessCodeRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const [entries, setEntries] = useState<AccessCodeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedSearchCode, setSelectedSearchCode] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetchSupportAccessCodes({
        page: 1,
        limit: 100,
        search: search.trim() || undefined,
      });
      setEntries(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setListError(err?.message || 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const handleLogout = async () => {
    await logoutSupport().catch(() => undefined);
    onLogout();
  };

  const handleIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await issueSupportAccessCode({
        customerName: form.customerName.trim(),
        customerId: form.customerId.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        phone: form.phone.trim(),
        printer: form.printer.trim(),
      });
      setLastIssued(result.record);
      setForm(emptyForm);
      await loadEntries();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to generate code');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="admin-app-shell">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--card-bg)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <img src="/seznik_logo.png" alt="Seznik" className="navbar-logo" style={{ height: 28 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
              Customer Support
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Signed in as <strong style={{ color: 'var(--text-main)' }}>{agent.username}</strong>
              {agent.name ? ` · ${agent.name}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <Search size={14} /> Search Code
          </button>
          <AnimatedThemeToggler variant="circle" duration={500} />
          <button
            type="button"
            onClick={() => void handleLogout()}
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
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      <main className="admin-main" style={{ overflow: 'auto' }}>
        <div className="admin-page-stack" style={{ gap: 16 }}>
          <section
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 14,
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(37, 99, 235, 0.12)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={18} color="var(--accent-blue)" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Issue access code</h2>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Generated by is filled automatically from your username
                </p>
              </div>
            </div>

            <form onSubmit={handleIssue}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Customer name
                  <input
                    style={controlStyle}
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    required
                    maxLength={160}
                    placeholder="Customer full name"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Customer ID
                  <input
                    style={controlStyle}
                    value={form.customerId}
                    onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                    required
                    maxLength={120}
                    placeholder="Merchant / customer ID"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Invoice number
                  <input
                    style={controlStyle}
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                    required
                    maxLength={120}
                    placeholder="INV-…"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Phone number
                  <input
                    style={controlStyle}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    required
                    maxLength={40}
                    placeholder="10-digit mobile"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                  Printer
                  <select
                    style={controlStyle}
                    value={form.printer}
                    onChange={(e) => setForm((f) => ({ ...f, printer: e.target.value }))}
                    required
                  >
                    <option value="">Select printer</option>
                    {printers.map((p) => (
                      <option key={p.sku} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Generated by
                  <input style={{ ...controlStyle, opacity: 0.85 }} value={agent.username} readOnly />
                </label>
              </div>

              {formError && (
                <div
                  style={{
                    marginTop: 12,
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
                  {formError}
                </div>
              )}

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent-blue)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.75 : 1,
                  }}
                >
                  {submitting ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}
                  {submitting ? 'Generating…' : 'Generate access code'}
                </button>
              </div>
            </form>

            {lastIssued && (
              <div
                style={{
                  marginTop: 16,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={18} color="#10B981" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>Code generated</div>
                    <div
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: 'var(--text-main)',
                      }}
                    >
                      {lastIssued.code}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyCode(lastIssued.code)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={13} /> {copied ? 'Copied!' : 'Copy code'}
                </button>
              </div>
            )}
          </section>

          <section
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              minHeight: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Your entries</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {total} code{total === 1 ? '' : 's'} generated by {agent.username}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                  />
                  <input
                    style={{ ...controlStyle, paddingLeft: 32, width: 220 }}
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
                    setSearch(searchDraft);
                    void loadEntries();
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    fontWeight: 600,
                    fontSize: '0.74rem',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} /> Refresh
                </button>
              </div>
            </div>

            {listError && (
              <div style={{ color: '#EF4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> {listError}
              </div>
            )}

            <div style={{ overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-main)', position: 'sticky', top: 0 }}>
                    {[
                      'Customer name',
                      'ID',
                      'Invoice',
                      'Phone',
                      'Printer',
                      'Code',
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
                      <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Loader2 size={16} className="spin" style={{ display: 'inline', marginRight: 8 }} />
                        Loading…
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Headphones size={18} style={{ display: 'inline', marginRight: 8, opacity: 0.5 }} />
                        No codes issued yet
                      </td>
                    </tr>
                  ) : (
                    entries.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
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
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={row.printer || undefined}
                        >
                          {row.printer || '—'}
                        </td>
                        <td
                          onClick={() => {
                            setSelectedSearchCode(row.code);
                            setSearchModalOpen(true);
                          }}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border-color)',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            cursor: 'pointer',
                            textDecoration: 'underline dotted',
                            color: 'var(--accent-blue)',
                          }}
                          title="Click to view details and status"
                        >
                          {row.code}
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
        </div>
      </main>

      <CodeSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchFn={lookupSupportAccessCode}
        initialCode={selectedSearchCode}
        title="Search Access Code"
      />
    </div>
  );
};
