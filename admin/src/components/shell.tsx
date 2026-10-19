'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Library,
  MessageSquare,
  Users,
  Printer,
  ShoppingBag,
  Shapes,
  Settings,
  Menu,
  X,
  Calendar,
  Clock,
} from 'lucide-react';

import { DeskProviders } from '@/components/desk';
import { AnimatedThemeToggler } from '@/panel/components/AnimatedThemeToggler';
import { api } from '@/lib/client';
import type { Admin } from '@/lib/types';

const NAV = [
  { href: '/overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
  { href: '/users', label: 'Users', shortLabel: 'Users', icon: Users },
  { href: '/printers', label: 'Printers', shortLabel: 'Printers', icon: Printer },
  { href: '/shop', label: 'Shop clicks', shortLabel: 'Shop', icon: ShoppingBag },
  { href: '/templates', label: 'Templates', shortLabel: 'Templates', icon: Library },
  { href: '/clipart', label: 'Clipart', shortLabel: 'Clipart', icon: Shapes },
  { href: '/feedback', label: 'Feedback', shortLabel: 'Feedback', icon: MessageSquare },
  { href: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Null until mounted so the server and first client render agree.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    api<Admin>('/api/auth/me')
      .then(setAdmin)
      .catch((error: Error) => setLoadError(error.message || 'Could not open the desk.'));
  }, []);

  useEffect(() => setMobileMenuOpen(false), [pathname]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const formattedDate = now?.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const formattedTime = now?.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  return (
    <div className="admin-app-shell">
      <header className="admin-navbar">
        <div className="admin-navbar-top">
          <div className="admin-navbar-brand">
            <img
              src="/seznik_logo.png"
              alt="Seznik"
              className="navbar-logo"
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                objectFit: 'contain',
                boxShadow: '0 2px 8px rgba(59,130,246,0.18)',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <h1 className="admin-navbar-title">Seznik Admin Panel</h1>
            </div>
          </div>

          <div className="admin-navbar-right">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <div className={`admin-navbar-actions${mobileMenuOpen ? ' is-open' : ''}`}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--tab-border)',
                  background: 'var(--tab-bg)',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                }}
              >
                <Calendar size={13} color="var(--accent-blue)" />
                <span>{formattedDate}</span>
                <span style={{ opacity: 0.5 }}>|</span>
                <Clock size={13} color="#10B981" />
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formattedTime}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--navbar-text-muted)' }}>IST</span>
              </div>

              <AnimatedThemeToggler variant="circle" duration={500} />

              {admin ? (
                <button type="button" className="admin-logout-btn" onClick={signOut}>
                  Logout
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <nav className={`admin-navbar-tabs${mobileMenuOpen ? ' is-open' : ''}`} aria-label="Desk">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-navbar-tab${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={15} />
                <span className="tab-label-full">{item.label}</span>
                <span className="tab-label-short">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="admin-main" id="main">
        {admin ? (
          <DeskProviders admin={admin}>{children}</DeskProviders>
        ) : loadError ? (
          <div className="note" role="alert">
            <p style={{ margin: 0 }}>{loadError}</p>
            <button type="button" className="btn primary" style={{ marginTop: 12 }} onClick={signOut}>
              Sign in again
            </button>
          </div>
        ) : (
          <p className="loading">Opening the desk…</p>
        )}
      </main>
    </div>
  );
}
