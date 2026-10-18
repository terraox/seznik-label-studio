import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Users, 
  LayoutGrid, 
  RefreshCw, 
  Clock, 
  Calendar,
  UserCheck,
  ExternalLink,
  HeartPulse,
  MessageSquare,
  Menu,
  X,
  LogOut,
  KeyRound,
  Headphones,
  Printer,
} from 'lucide-react';
import { AnimatedThemeToggler } from './AnimatedThemeToggler';

interface NavbarProps {
  activeTab: string;
  onSelectTab?: (tab: string) => void;
  setActiveTab?: (tab: string) => void;
  timeRange?: string;
  onSelectTimeRange?: (range: string) => void;
  setTimeRange?: (range: string) => void;
  showTimeRange?: boolean;
  lastRefreshedAt: string;
  onRefresh: () => void;
  autoRefreshInterval: number;
  onSelectAutoRefreshInterval?: (interval: number) => void;
  setAutoRefreshInterval?: (interval: number) => void;
  userId?: string;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  setActiveTab,
  timeRange = 'all',
  onSelectTimeRange,
  setTimeRange,
  showTimeRange = false,
  lastRefreshedAt,
  onRefresh,
  autoRefreshInterval,
  onSelectAutoRefreshInterval,
  setAutoRefreshInterval,
  userId = 'Admin',
  onLogout,
}) => {
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1201px)');
    const closeOnDesktop = () => {
      if (mq.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener('change', closeOnDesktop);
    return () => mq.removeEventListener('change', closeOnDesktop);
  }, []);

  const formattedDate = currentDateTime.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const formattedTime = currentDateTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  const handleTabClick = (tabId: string) => {
    if (onSelectTab) {
      onSelectTab(tabId);
    } else if (setActiveTab) {
      setActiveTab(tabId);
    }
    setMobileMenuOpen(false);
  };

  const handleAutoRefreshChange = (interval: number) => {
    if (onSelectAutoRefreshInterval) {
      onSelectAutoRefreshInterval(interval);
    } else if (setAutoRefreshInterval) {
      setAutoRefreshInterval(interval);
    }
  };

  const handleTimeRangeChange = (range: string) => {
    if (onSelectTimeRange) {
      onSelectTimeRange(range);
    } else if (setTimeRange) {
      setTimeRange(range);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview & Metrics', shortLabel: 'Overview', icon: Activity },
    { id: 'sections', label: 'Section Analytics', shortLabel: 'Sections', icon: LayoutGrid },
    { id: 'users', label: 'Registered Users', shortLabel: 'Users', icon: Users },
    { id: 'printers', label: 'Printer Analytics', shortLabel: 'Printers', icon: Printer },
    { id: 'traffic', label: 'Traffic', shortLabel: 'Traffic', icon: Activity },
    { id: 'redirects', label: 'Redirects', shortLabel: 'Redirects', icon: ExternalLink },
    { id: 'feedback', label: 'Reviews & Suggestions', shortLabel: 'Reviews', icon: MessageSquare },
    { id: 'codes', label: 'Access Codes', shortLabel: 'Codes', icon: KeyRound },
    { id: 'support', label: 'Support Access', shortLabel: 'Support', icon: Headphones },
    { id: 'health', label: 'System Health', shortLabel: 'Health', icon: HeartPulse },
  ];

  return (
    <header className="admin-navbar">
      <div className="admin-navbar-top">
        <div className="admin-navbar-brand">
          <img
            src="/seznik_logo.png"
            alt="Seznik Logo"
            className="navbar-logo"
            style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'contain', boxShadow: '0 2px 8px rgba(59,130,246,0.18)', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h1 className="admin-navbar-title">
              Seznik Admin Panel
            </h1>
          </div>
        </div>

        <div className="admin-navbar-right">
        <div className={`admin-navbar-actions${mobileMenuOpen ? ' is-open' : ''}`}>
          <a
            href="/swagger"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--tab-border)',
              background: 'var(--tab-bg)',
              color: 'var(--accent-blue)',
              fontSize: '0.76rem',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
            title="API inventory — what to implement next"
          >
            API docs
          </a>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--tab-border)',
              background: 'var(--tab-bg)',
              color: 'var(--navbar-text)',
              fontSize: '0.76rem',
              fontWeight: 600,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              userSelect: 'none',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-blue)' }}>
              <Calendar size={13} />
              <span>{formattedDate}</span>
            </div>
            <span style={{ color: 'var(--navbar-text-muted)', opacity: 0.5 }}>|</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--navbar-text)' }}>
              <Clock size={13} color="#10B981" />
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.3px', fontWeight: 700 }}>{formattedTime}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--navbar-text-muted)', fontWeight: 600 }}>IST</span>
            </div>
          </div>

          {showTimeRange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--tab-bg)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--tab-border)' }}>
            <Calendar size={13} color="var(--accent-blue)" />
            <span className="navbar-label-full" style={{ fontSize: '0.75rem', color: 'var(--navbar-text-muted)', fontWeight: 500 }}>Range:</span>
            <select
              className="custom-select"
              value={timeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--navbar-text)',
                fontSize: '0.75rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="3d">Last 3 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--tab-bg)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--tab-border)', transition: 'background 0.3s ease' }}>
            {autoRefreshInterval > 0 && (
              <span className="pulse-dot" style={{ width: '6px', height: '6px', background: '#10B981' }} />
            )}
            <span className="navbar-label-full" style={{ fontSize: '0.75rem', color: 'var(--navbar-text-muted)', fontWeight: 500 }}>Auto Refresh:</span>
            <select
              className="custom-select"
              value={autoRefreshInterval}
              onChange={(e) => handleAutoRefreshChange(Number(e.target.value))}
              aria-label="Auto refresh interval"
              style={{
                background: 'transparent',
                border: 'none',
                color: autoRefreshInterval > 0 ? '#10B981' : 'var(--navbar-text)',
                fontSize: '0.75rem',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value={0}>Off (Manual)</option>
              <option value={10}>Every 10s</option>
              <option value={30}>Every 30s</option>
              <option value={60}>Every 1 min</option>
              <option value={300}>Every 5 mins</option>
            </select>
          </div>

          <button
            onClick={onRefresh}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--tab-border)',
              background: 'var(--tab-bg)',
              color: 'var(--navbar-text)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={13} color="var(--accent-blue)" />
            <span>Refresh</span>
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            fontSize: '0.72rem',
            color: 'var(--navbar-text-muted)',
            borderRadius: '9999px',
            border: '1px solid var(--tab-border)',
            background: 'var(--tab-bg)',
            whiteSpace: 'nowrap',
          }}>
            <Clock size={12} />
            <span>Updated: {lastRefreshedAt}</span>
          </div>

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '5px 10px', 
            background: 'rgba(59, 130, 246, 0.08)', 
            border: '1px solid rgba(59, 130, 246, 0.2)', 
            borderRadius: '9999px' 
          }}>
            <UserCheck size={14} color="var(--accent-blue)" />
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-blue)' }}>{userId}</span>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="admin-logout-btn"
            >
              <LogOut size={13} />
              Logout
            </button>
          )}
        </div>

        <div className="admin-navbar-end">
          <AnimatedThemeToggler variant="circle" duration={500} />
          <button
            type="button"
            className="admin-navbar-menu-btn"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close toolbar' : 'Open toolbar'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        </div>
      </div>

      <div className="admin-navbar-tabs-wrap">
      <div className="admin-navbar-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`admin-navbar-tab${isSelected ? ' is-active' : ''}`}
            >
              <Icon size={15} color={isSelected ? 'var(--accent-blue)' : undefined} />
              <span className="tab-label-full">{tab.label}</span>
              <span className="tab-label-short">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
      </div>
    </header>
  );
};
