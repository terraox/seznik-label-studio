import React, { useEffect, useState } from 'react';
import App from './App';
import { LoginPage } from './pages/LoginPage';
import { SupportLoginPage } from './pages/SupportLoginPage';
import { SupportPortalApp } from './pages/SupportPortalApp';
import { fetchAdminSession, logoutAdmin } from './services/authService';
import { fetchSupportSession, logoutSupport } from './services/api';
import type { SupportAgentRecord } from './types/admin';

type AuthStatus = 'loading' | 'guest' | 'authed';
type SupportStatus = 'loading' | 'guest' | 'authed';

function isSupportRoute() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/support' || window.location.pathname.startsWith('/support/');
}

function showLoginRoute() {
  if (window.location.pathname !== '/login') {
    window.history.replaceState(null, '', '/login');
  }
}

function showAppRoute() {
  if (window.location.pathname === '/login') {
    window.history.replaceState(null, '', '/');
  }
}

function showSupportLoginRoute() {
  if (window.location.pathname !== '/support') {
    window.history.replaceState(null, '', '/support');
  }
}

function showSupportAppRoute() {
  if (window.location.pathname !== '/support') {
    window.history.replaceState(null, '', '/support');
  }
}

const SupportAuthRoot: React.FC = () => {
  const [status, setStatus] = useState<SupportStatus>('loading');
  const [agent, setAgent] = useState<SupportAgentRecord | null>(null);

  const enterGuest = () => {
    showSupportLoginRoute();
    setAgent(null);
    setStatus('guest');
  };

  const enterApp = (next: SupportAgentRecord) => {
    setAgent(next);
    showSupportAppRoute();
    setStatus('authed');
  };

  useEffect(() => {
    let cancelled = false;
    fetchSupportSession()
      .then((session) => {
        if (!cancelled) enterApp(session.agent);
      })
      .catch(() => {
        if (!cancelled) enterGuest();
      });

    const onExpired = () => enterGuest();
    window.addEventListener('support-auth-required', onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener('support-auth-required', onExpired);
    };
  }, []);

  const handleLogout = async () => {
    await logoutSupport().catch(() => undefined);
    enterGuest();
  };

  if (status === 'loading') {
    return (
      <div className="admin-login-shell">
        <div className="pulse-dot" style={{ width: '14px', height: '14px' }} />
      </div>
    );
  }

  if (status === 'guest' || !agent) {
    return <SupportLoginPage onSuccess={enterApp} />;
  }

  return <SupportPortalApp agent={agent} onLogout={handleLogout} />;
};

export const AuthRoot: React.FC = () => {
  const [isSupport, setIsSupport] = useState(() => isSupportRoute());
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState('SezAdmin');

  useEffect(() => {
    const sync = () => setIsSupport(isSupportRoute());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const enterGuest = () => {
    showLoginRoute();
    setStatus('guest');
  };

  const enterApp = (id: string) => {
    setUserId(id);
    showAppRoute();
    setStatus('authed');
  };

  useEffect(() => {
    if (isSupport) return;

    let cancelled = false;
    fetchAdminSession()
      .then((session) => {
        if (!cancelled) enterApp(session.userId);
      })
      .catch(() => {
        if (!cancelled) enterGuest();
      });

    const onExpired = () => enterGuest();
    window.addEventListener('admin-auth-required', onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener('admin-auth-required', onExpired);
    };
  }, [isSupport]);

  const handleLogout = async () => {
    await logoutAdmin().catch(() => undefined);
    enterGuest();
  };

  if (isSupport) {
    return <SupportAuthRoot />;
  }

  if (status === 'loading') {
    return (
      <div className="admin-login-shell">
        <div className="pulse-dot" style={{ width: '14px', height: '14px' }} />
      </div>
    );
  }

  if (status === 'guest') {
    return <LoginPage onSuccess={enterApp} />;
  }

  return <App userId={userId} onLogout={handleLogout} />;
};
