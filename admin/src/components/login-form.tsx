'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, LogIn, Shield, UserRound } from 'lucide-react';

import { AnimatedThemeToggler } from '@/panel/components/AnimatedThemeToggler';

export function LoginForm() {
  const [username, setUsername] = useState('seznikadmin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then((response) => {
      if (response.ok) window.location.href = '/overview';
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email: username, password }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(data.error || 'Could not sign in.');
      return;
    }
    window.location.href = '/overview';
  }

  return (
    <div className="admin-login-shell">
      <div className="admin-login-theme">
        <AnimatedThemeToggler variant="circle" duration={500} />
      </div>

      <form className="admin-login-card" onSubmit={onSubmit}>
        <div className="admin-login-brand">
          <img src="/seznik_logo.png" alt="Seznik" className="navbar-logo admin-login-logo" />
          <span className="badge badge-active admin-login-live">
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            SEZ PRINT DESK
          </span>
          <h1>Seznik Admin Panel</h1>
          <p>Devices, template library, feedback, and team access for SEZ Print.</p>
        </div>

        {error ? (
          <div className="admin-login-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="admin-login-fields">
          <label className="admin-login-field" htmlFor="desk-user">
            Username
          </label>
          <div className="admin-login-input-wrap">
            <UserRound size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="desk-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seznikadmin"
              required
            />
          </div>

          <label className="admin-login-field" htmlFor="desk-password">
            Password
          </label>
          <div className="admin-login-input-wrap admin-login-input-wrap--password">
            <Lock size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="desk-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
            <button
              type="button"
              className="admin-login-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" className="admin-login-submit" disabled={pending}>
          <LogIn size={16} />
          {pending ? 'Signing in…' : 'Sign in to console'}
        </button>

        <div className="admin-login-foot">
          <Shield size={13} />
          Authorized operators only
        </div>
      </form>
    </div>
  );
}
