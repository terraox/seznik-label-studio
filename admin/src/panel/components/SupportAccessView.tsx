import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileBarChart2,
  Headphones,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  createSupportAgent,
  disableSupportAgent,
  enableSupportAgent,
  fetchSupportAgents,
  lookupAdminAccessCode,
  resetSupportAgentPassword,
  revokeSupportAgent,
} from '../services/api';
import type { SupportAgentRecord } from '../types/admin';
import { CodeSearchModal } from './CodeSearchModal';

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

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.74rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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

function generateClientPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[values[i] % alphabet.length];
  return out;
}

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  username: '',
  password: '',
};

type CreatedCreds = {
  name: string;
  phone: string;
  email: string;
  username: string;
  password: string;
};

function formatCredsBlock(creds: CreatedCreds) {
  return [
    `Name: ${creds.name}`,
    `Phone: ${creds.phone}`,
    `Email: ${creds.email}`,
    `Username: ${creds.username}`,
    `Password: ${creds.password}`,
  ].join('\n');
}

export const SupportAccessView: React.FC<{ onViewReports?: () => void }> = ({ onViewReports }) => {
  const [agents, setAgents] = useState<SupportAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedSearchCode, setSelectedSearchCode] = useState('');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSupportAgents();
      setAgents(res.items || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load support agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const openModal = () => {
    setForm({ ...emptyForm, password: generateClientPassword() });
    setFormError(null);
    setCreatedCreds(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setFormError(null);
  };

  const handleCreate = async () => {
    const phoneDigits = form.phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(phoneDigits)) {
      setFormError('Phone number must be exactly 10 digits');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await createSupportAgent({
        name: form.name.trim(),
        phone: phoneDigits,
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
      });
      setCreatedCreds({
        name: result.agent.name,
        phone: result.agent.phone,
        email: result.agent.email,
        username: result.agent.username,
        password: result.password,
      });
      setCopiedKey(null);
      setModalOpen(false);
      setForm(emptyForm);
      await loadAgents();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDisabled = async (agent: SupportAgentRecord) => {
    setBusyId(agent.id);
    setError(null);
    try {
      if (agent.isDisabled) await enableSupportAgent(agent.id);
      else await disableSupportAgent(agent.id);
      await loadAgents();
    } catch (err: any) {
      setError(err?.message || 'Failed to update access');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (agent: SupportAgentRecord) => {
    const ok = window.confirm(
      `Revoke access for ${agent.name} (@${agent.username})?\n\nThis permanently deletes their credentials.`
    );
    if (!ok) return;
    setBusyId(agent.id);
    setError(null);
    try {
      await revokeSupportAgent(agent.id);
      if (createdCreds?.username === agent.username) setCreatedCreds(null);
      await loadAgents();
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke access');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (agent: SupportAgentRecord) => {
    const ok = window.confirm(
      `Reset password for ${agent.name} (@${agent.username})?\n\nA new password will be shown once — copy it before closing.`
    );
    if (!ok) return;
    setBusyId(agent.id);
    setError(null);
    try {
      const result = await resetSupportAgentPassword(agent.id);
      setCreatedCreds({
        name: result.agent.name,
        phone: result.agent.phone,
        email: result.agent.email,
        username: result.agent.username,
        password: result.password,
      });
      setCopiedKey(null);
      await loadAgents();
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setBusyId(null);
    }
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="admin-page-stack" style={{ gap: '16px' }}>
      <section
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            <Headphones size={18} color="var(--accent-blue)" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Support Access</h2>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Create credentials for customer support staff · portal at{' '}
              <a href="/support" style={{ color: 'var(--accent-blue)' }}>/support</a>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={actionBtnStyle}
            onClick={() => {
              setSelectedSearchCode('');
              setSearchModalOpen(true);
            }}
          >
            <Search size={13} color="var(--accent-blue)" /> Search Code
          </button>
          {onViewReports ? (
            <button type="button" style={actionBtnStyle} onClick={onViewReports}>
              <FileBarChart2 size={13} /> View reports
            </button>
          ) : null}
          <button type="button" style={actionBtnStyle} onClick={() => void loadAgents()}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            type="button"
            onClick={openModal}
            style={{
              ...actionBtnStyle,
              background: 'var(--accent-blue)',
              borderColor: 'var(--accent-blue)',
              color: '#fff',
              padding: '8px 14px',
            }}
          >
            <Plus size={14} /> Generate ID
          </button>
        </div>
      </section>

      {createdCreds && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10B981" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>Credentials created</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Copy and share these details now — the password won’t be shown again.
                  Sign in on the Support Portal with the username (or email) and password.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void copyText('all', formatCredsBlock(createdCreds))}
                style={{
                  ...actionBtnStyle,
                  background: 'var(--accent-blue)',
                  borderColor: 'var(--accent-blue)',
                  color: '#fff',
                  padding: '8px 14px',
                }}
              >
                <Copy size={13} /> {copiedKey === 'all' ? 'Copied!' : 'Copy details'}
              </button>
              <button type="button" style={actionBtnStyle} onClick={() => setCreatedCreds(null)}>
                <X size={13} /> Dismiss
              </button>
            </div>
          </div>

          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-main)',
              fontSize: '0.8rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--text-main)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.55,
            }}
          >
            {formatCredsBlock(createdCreds)}
          </pre>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#EF4444',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      <section
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Support agents</h3>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {agents.length} credential{agents.length === 1 ? '' : 's'}
          </p>
        </div>

        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Username</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Phone</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Created</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && agents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={16} className="spin" style={{ display: 'inline', marginRight: 8 }} />
                    Loading support agents…
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No support credentials yet. Click Generate ID to create one.
                  </td>
                </tr>
              ) : (
                agents.map((agent) => {
                  const busy = busyId === agent.id;
                  return (
                    <tr key={agent.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{agent.name}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace' }}>{agent.username}</td>
                      <td style={{ padding: '10px 12px' }}>{agent.email}</td>
                      <td style={{ padding: '10px 12px' }}>{agent.phone}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: agent.isDisabled ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                            color: agent.isDisabled ? '#EF4444' : '#059669',
                          }}
                        >
                          {agent.isDisabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                        {formatWhen(agent.createdAt)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            style={actionBtnStyle}
                            disabled={busy}
                            onClick={() => void handleResetPassword(agent)}
                          >
                            <KeyRound size={12} /> Reset password
                          </button>
                          <button
                            type="button"
                            style={actionBtnStyle}
                            disabled={busy}
                            onClick={() => void handleToggleDisabled(agent)}
                          >
                            {agent.isDisabled ? <ShieldCheck size={12} /> : <ShieldOff size={12} />}
                            {agent.isDisabled ? 'Enable' : 'Disable access'}
                          </button>
                          <button
                            type="button"
                            style={{ ...actionBtnStyle, color: '#EF4444', borderColor: 'rgba(239,68,68,0.35)' }}
                            disabled={busy}
                            onClick={() => void handleRevoke(agent)}
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={closeModal}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 14,
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Generate support ID</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Create login credentials for a support team member
                </p>
              </div>
              <button type="button" onClick={closeModal} style={{ ...actionBtnStyle, padding: 6 }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Name *</span>
                <input style={controlStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Phone number *</span>
                <input
                  style={controlStyle}
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      phone: e.target.value.replace(/\D/g, '').slice(0, 10),
                    }))
                  }
                  placeholder="10-digit mobile number"
                  inputMode="numeric"
                  maxLength={10}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email *</span>
                <input style={controlStyle} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Username *</span>
                <input style={controlStyle} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="support.agent" autoComplete="off" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password *</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={controlStyle}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    style={{ ...actionBtnStyle, flexShrink: 0 }}
                    onClick={() => setForm((f) => ({ ...f, password: generateClientPassword() }))}
                  >
                    <KeyRound size={13} /> Regenerate
                  </button>
                </div>
              </label>
            </div>

            {formError && (
              <div style={{ marginTop: 12, color: '#EF4444', fontSize: '0.78rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={14} /> {formError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" style={actionBtnStyle} onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={saving}
                style={{
                  ...actionBtnStyle,
                  background: 'var(--accent-blue)',
                  borderColor: 'var(--accent-blue)',
                  color: '#fff',
                  padding: '8px 14px',
                }}
              >
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {saving ? 'Creating…' : 'Create credentials'}
              </button>
            </div>
          </div>
        </div>
      )}

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
