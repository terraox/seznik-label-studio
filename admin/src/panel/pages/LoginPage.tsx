import React, { useState } from 'react';
import { Lock, UserRound, LogIn, AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';
import { AnimatedThemeToggler } from '../components/AnimatedThemeToggler';
import { loginAdmin } from '../services/authService';

interface LoginPageProps {
  onSuccess: (userId: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginAdmin(userId.trim(), password);
      onSuccess(result.userId);
    } catch (err: any) {
      setError(err?.message || 'Invalid user ID or password');
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
            <span className="pulse-dot" style={{ width: '6px', height: '6px' }} />
            LIVE TELEMETRY
          </span>
          <h1>Seznik Admin Panel</h1>
          <p>Restricted console for merchant analytics, sessions, and system health.</p>
        </div>

        {error && (
          <div className="admin-login-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="admin-login-fields">
          <label className="admin-login-field" htmlFor="admin-user-id">
            User ID
          </label>
          <div className="admin-login-input-wrap">
            <UserRound size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="admin-user-id"
              type="text"
              autoComplete="username"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter user ID"
              required
            />
          </div>

          <label className="admin-login-field" htmlFor="admin-password">
            Password
          </label>
          <div className="admin-login-input-wrap admin-login-input-wrap--password">
            <Lock size={16} className="admin-login-input-icon" aria-hidden />
            <input
              id="admin-password"
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
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button type="submit" className="admin-login-submit" disabled={submitting}>
          <LogIn size={16} />
          {submitting ? 'Signing in…' : 'Sign in to console'}
        </button>

        <div className="admin-login-foot">
          <Shield size={13} />
          Authorized operators only
        </div>
      </form>
    </div>
  );
};
