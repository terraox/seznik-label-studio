'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Lock, Shield } from 'lucide-react';

type Details = { email: string; needsPassword: boolean; secret: string; otpauthUri: string };

/** First sign-in: choose a new password (if one was issued to you) and enrol an authenticator app. */
export function SetupForm() {
  const [details, setDetails] = useState<Details | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup')
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as Partial<Details> & { error?: string };
        if (!response.ok) {
          window.location.href = '/login';
          return;
        }
        setDetails(data as Details);
      })
      .catch(() => setError('Could not load setup details.'));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const response = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword, code }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error || 'Could not finish setup.');
      return;
    }
    window.location.href = '/overview';
  }

  return (
    <div className="admin-login-shell">
      <form className="admin-login-card" onSubmit={onSubmit}>
        <div className="admin-login-brand">
          <img src="/seznik_logo.png" alt="Seznik" className="navbar-logo admin-login-logo" />
          <h1>Finish setting up</h1>
          <p>{details ? `Signed in as ${details.email}.` : 'Loading…'}</p>
        </div>

        {error ? (
          <div className="admin-login-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        {details ? (
          <div className="admin-login-fields">
            {details.needsPassword ? (
              <>
                <label className="admin-login-field" htmlFor="setup-password">
                  New password (12+ characters)
                </label>
                <div className="admin-login-input-wrap">
                  <Lock size={16} className="admin-login-input-icon" aria-hidden />
                  <input
                    id="setup-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : null}

            <label className="admin-login-field">Authenticator app</label>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>
              Add an account in your authenticator app using this key (time-based), then enter the 6-digit code.
            </p>
            <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 14, margin: '0 0 8px' }}>
              {details.secret}
            </code>
            <a href={details.otpauthUri} style={{ fontSize: 12 }}>
              Open in authenticator app
            </a>

            <label className="admin-login-field" htmlFor="setup-code">
              Code from the app
            </label>
            <div className="admin-login-input-wrap">
              <Shield size={16} className="admin-login-input-icon" aria-hidden />
              <input
                id="setup-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
          </div>
        ) : null}

        <button type="submit" className="admin-login-submit" disabled={pending || !details}>
          {pending ? 'Saving…' : 'Finish and sign in'}
        </button>
      </form>
    </div>
  );
}
