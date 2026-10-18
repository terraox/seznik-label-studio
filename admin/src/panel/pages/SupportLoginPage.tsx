import React, { useState } from 'react';
import { Lock, UserRound, LogIn, AlertTriangle, Eye, EyeOff, Headphones } from 'lucide-react';
import { AnimatedThemeToggler } from '../components/AnimatedThemeToggler';
import { loginSupport } from '../services/api';
import type { SupportAgentRecord } from '../types/admin';

interface SupportLoginPageProps {
  onSuccess: (agent: SupportAgentRecord) => void;
}

export const SupportLoginPage: React.FC<SupportLoginPageProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginSupport(username.trim(), password);
      onSuccess(result.agent);
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login-shell">
      <div className="admin-login-theme">
        <AnimatedThemeToggler variant="circle" duration={500} />
      </div>

      <form className="admin-login-card" onSubmit={handleSubmit}>
        <div className="admin-login-brand">
          <img src="/seznik_logo.png" alt="Seznik" className="navbar-logo admin-login-logo" />
          <span className="badge badge-active admin-login-live">
            <Headphones size={12} />
            SUPPORT PORTAL
          </span>
          <h1>Customer Support</h1>
          <p>Issue access codes for customers and review your generation history.</p>
        </div>

        {error && (
          <div className="admin-login-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="admin-login-fields">
          <label className="admin-login-field" htmlFor="support-username">
            Username or email
          </label>
          <div className="admin-login-input-wrap">
            <UserRound size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="support-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="support.agent or name@company.com"
              required
            />
          </div>

          <label className="admin-login-field" htmlFor="support-password">
            Password
          </label>
          <div className="admin-login-input-wrap admin-login-input-wrap--password">
            <Lock size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="support-password"
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

        <button type="submit" className="admin-login-submit" disabled={submitting}>
          <LogIn size={16} />
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
