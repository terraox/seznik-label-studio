import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Printer,
  Search,
  Store,
  User,
  X,
} from 'lucide-react';
import type { AccessCodeLookupResult, AccessCodeRecord } from '../types/admin';

interface CodeSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchFn: (code: string) => Promise<AccessCodeLookupResult>;
  initialCode?: string;
  title?: string;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
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

function formatBusinessType(type?: string | null) {
  if (!type) return null;
  switch (type) {
    case 'restaurant_cafe':
      return 'Restaurant / Café';
    case 'retail_shop':
      return 'Retail Shop';
    case 'online_store':
      return 'Online Store';
    default:
      return type.replace(/_/g, ' ');
  }
}

export const CodeSearchModal: React.FC<CodeSearchModalProps> = ({
  isOpen,
  onClose,
  searchFn,
  initialCode = '',
  title = 'Search Access Code',
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AccessCodeLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const executeSearch = useCallback(
    async (codeToSearch: string) => {
      const q = codeToSearch.trim();
      if (!q) {
        setError('Please enter an access code, invoice number, or phone');
        setResult(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await searchFn(q);
        setResult(res);
        if (!res.found) {
          setError(res.message || `No access code found matching "${q}"`);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to lookup access code');
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [searchFn]
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(searchInput);
  };

  // Sync initialCode ONLY when modal opens or initialCode changes
  useEffect(() => {
    if (isOpen) {
      const code = (initialCode || '').trim();
      setSearchInput(code);
      if (code) {
        void executeSearch(code);
      } else {
        setResult(null);
        setError(null);
      }
    } else {
      setResult(null);
      setError(null);
      setSearchInput('');
    }
  }, [isOpen, initialCode, executeSearch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const copyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const record: AccessCodeRecord | null = result?.record || null;
  const isRedeemed = Boolean(result?.isRedeemed || record?.isUsed);
  const redeemed = record?.redeemedUser;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '580px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-card, #141414)',
          borderRadius: '16px',
          border: '1px solid var(--border-color, #262626)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-main, #f2f2f2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color, #262626)',
            background: 'var(--bg-card, #141414)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-blue, #4f8ef7)',
                flexShrink: 0,
              }}
            >
              <KeyRound size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main, #f2f2f2)' }}>
                {title}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted, #888888)' }}>
                Verify status, redemption details, and generator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted, #888888)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search bar section */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color, #262626)',
            background: 'var(--bg-main, #0a0a0a)',
          }}
        >
          <form
            onSubmit={handleFormSubmit}
            style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #888888)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Enter 7-char code, invoice #, phone…"
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 34px 0 38px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #262626)',
                  backgroundColor: 'var(--bg-card, #141414)',
                  color: 'var(--text-main, #f2f2f2)',
                  fontSize: '0.88rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  letterSpacing: '0.04em',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #888888)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Clear input"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '42px',
                padding: '0 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'var(--accent-blue, #4f8ef7)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: loading || !searchInput.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !searchInput.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap',
                transition: 'opacity 0.2s',
              }}
            >
              {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
              {loading ? 'Searching…' : 'Search'}
            </button>
          </form>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            background: 'var(--bg-card, #141414)',
          }}
        >
          {error && !record && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                color: '#f87171',
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !record && !error && (
            <div
              style={{
                textAlign: 'center',
                padding: '38px 20px',
                background: 'var(--bg-main, #0a0a0a)',
                border: '1px dashed var(--border-color, #262626)',
                borderRadius: '12px',
                color: 'var(--text-muted, #888888)',
              }}
            >
              <KeyRound size={34} style={{ color: 'var(--accent-blue, #4f8ef7)', opacity: 0.8, marginBottom: 10 }} />
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main, #f2f2f2)' }}>
                Search for any access code
              </p>
              <p style={{ margin: '6px auto 0', maxWidth: '380px', fontSize: '0.78rem', lineHeight: 1.45 }}>
                Check if a code is redeemed or available, inspect customer details, and verify who generated it.
              </p>
            </div>
          )}

          {record && (
            <>
              {/* Code Hero Banner with Status Badge */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: isRedeemed ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
                  background: isRedeemed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.68rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 700,
                      color: 'var(--text-muted, #888888)',
                      marginBottom: 3,
                    }}
                  >
                    Access Code
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      color: 'var(--text-main, #f2f2f2)',
                    }}
                  >
                    {record.code}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isRedeemed ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                      }}
                    >
                      <CheckCircle2 size={15} />
                      Redeemed
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        background: 'rgba(59, 130, 246, 0.18)',
                        color: 'var(--accent-blue, #4f8ef7)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                      }}
                    >
                      Available / Not Redeemed
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void copyCode(record.code)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #262626)',
                      background: 'var(--bg-card, #141414)',
                      color: 'var(--text-main, #f2f2f2)',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Copy code"
                  >
                    {copiedCode ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Redeemed Details Section (if redeemed) */}
              {isRedeemed && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    background: 'var(--bg-main, #0a0a0a)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} color="#10b981" />
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main, #f2f2f2)' }}>
                      Redemption Details
                    </h4>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Redeemed by Name / Shop</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Store size={14} color="var(--accent-blue, #4f8ef7)" />
                        {redeemed?.displayName || redeemed?.businessName || record.customerName || 'Store Owner'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Email</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Mail size={14} color="var(--text-muted, #888888)" />
                        {redeemed?.email || record.customerEmail || '—'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Phone</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={14} color="var(--text-muted, #888888)" />
                        {redeemed?.phone || record.phone || '—'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Redeemed On</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} color="var(--text-muted, #888888)" />
                        {formatWhen(record.usedAt || redeemed?.usedAt)}
                      </span>
                    </div>

                    {redeemed?.businessType ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Business Type</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)' }}>
                          {formatBusinessType(redeemed.businessType)}
                        </span>
                      </div>
                    ) : null}

                    {record.usedByUserId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>User Account ID</span>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', color: 'var(--text-muted, #888888)' }}>
                          {record.usedByUserId}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Generation Details Section (Who generated it) */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color, #262626)',
                  background: 'var(--bg-main, #0a0a0a)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} color="var(--accent-blue, #4f8ef7)" />
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main, #f2f2f2)' }}>
                    Generation Information
                  </h4>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    fontSize: '0.82rem',
                  }}
                >
                  {/* GENERATED BY: Crucial user requirement */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      border: '1px solid rgba(59, 130, 246, 0.28)',
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-blue, #4f8ef7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Generated By
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main, #f2f2f2)' }}>
                      {record.createdBy || 'Admin / Automated'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Generated On</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)' }}>
                      {formatWhen(record.createdAt)}
                    </span>
                  </div>

                  {record.note ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 12px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Shipment / Batch Note</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main, #f2f2f2)' }}>
                        {record.note}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* If customer sale details */}
                {(record.invoiceNumber || record.printer || (record.customerName && !isRedeemed)) ? (
                  <div
                    style={{
                      marginTop: 4,
                      paddingTop: 10,
                      borderTop: '1px dashed var(--border-color, #262626)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 8,
                      fontSize: '0.8rem',
                    }}
                  >
                    {record.invoiceNumber ? (
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Invoice: </span>
                        <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-main, #f2f2f2)' }}>{record.invoiceNumber}</strong>
                      </div>
                    ) : null}

                    {record.printer ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Printer size={13} color="var(--text-muted, #888888)" />
                        <span style={{ color: 'var(--text-main, #f2f2f2)' }}>{record.printer}</span>
                      </div>
                    ) : null}

                    {record.customerId ? (
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #888888)' }}>Customer ID: </span>
                        <span style={{ color: 'var(--text-main, #f2f2f2)' }}>{record.customerId}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color, #262626)',
            background: 'var(--bg-card, #141414)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #262626)',
              background: 'var(--bg-main, #0a0a0a)',
              color: 'var(--text-main, #f2f2f2)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
