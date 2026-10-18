import React, { useState, useEffect, useMemo } from 'react';
import {
  Smartphone,
  Globe,
  FileText,
  Activity,
  Calendar,
  Zap,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { TrafficTimeFrame } from '../types/appTraffic';
import type { InvoiceRecord } from '../types/admin';
import { fetchInvoices } from '../services/api';

const TIMEFRAMES: { id: TrafficTimeFrame; label: string }[] = [
  { id: '24h', label: 'Today / 24 Hours' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
];

export const TrafficView: React.FC = () => {
  const [timeFrame, setTimeFrame] = useState<TrafficTimeFrame>('all');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Custom date range state pre-filled with past 14 days to today
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const fourteenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  }, []);

  const [customStartDate, setCustomStartDate] = useState<string>(fourteenDaysAgoStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInvoices(timeFrame, 'all', 200);
      setInvoices(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load traffic invoices:', err);
      setError(err?.message || 'Failed to fetch invoice traffic telemetry from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [timeFrame]);

  // Timeframe limit calculation including custom date range
  const timeframeFilteredLogs = useMemo(() => {
    if (timeFrame === 'custom') {
      const startMs = new Date(`${customStartDate}T00:00:00`).getTime();
      const endMs = new Date(`${customEndDate}T23:59:59`).getTime();

      return invoices.filter((log) => {
        const logMs = new Date(log.createdAt).getTime();
        return logMs >= startMs && logMs <= endMs;
      });
    }

    if (timeFrame === 'all') return invoices;

    const now = Date.now();
    const windowMs =
      timeFrame === '24h'
        ? 24 * 3600 * 1000
        : timeFrame === '7d'
          ? 7 * 24 * 3600 * 1000
          : 30 * 24 * 3600 * 1000;

    return invoices.filter((log) => new Date(log.createdAt).getTime() >= now - windowMs);
  }, [invoices, timeFrame, customStartDate, customEndDate]);

  // Compute 3 Top Cards Metrics (Total, Mobile App, Web App)
  const metrics = useMemo(() => {
    const mobileLogs = timeframeFilteredLogs.filter((l) => l.platform === 'mobile');
    const webLogs = timeframeFilteredLogs.filter((l) => l.platform === 'web' || !l.platform);

    const mobileCount = mobileLogs.length;
    const webCount = webLogs.length;
    const totalCount = timeframeFilteredLogs.length;

    const mobileShare = totalCount > 0 ? Math.round((mobileCount / totalCount) * 100) : 0;
    const webShare = totalCount > 0 ? Math.round((webCount / totalCount) * 100) : (totalCount > 0 ? 100 : 0);

    return {
      totalCount,
      mobileCount,
      webCount,
      mobileShare,
      webShare,
    };
  }, [timeframeFilteredLogs]);

  // Timeline Chart Data generation for selected timeframe / custom date range
  const chartData = useMemo(() => {
    const points: { label: string; mobile: number; web: number; total: number }[] = [];

    if (timeFrame === '24h') {
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const slotEnd = new Date(now.getTime() - i * 4 * 3600 * 1000);
        const slotStart = new Date(slotEnd.getTime() - 4 * 3600 * 1000);
        const label = slotEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let mobile = 0;
        let web = 0;
        timeframeFilteredLogs.forEach((log) => {
          const dt = new Date(log.createdAt);
          if (dt >= slotStart && dt <= slotEnd) {
            if (log.platform === 'mobile') mobile++;
            else web++;
          }
        });
        points.push({ label, mobile, web, total: mobile + web });
      }
    } else if (timeFrame === 'custom') {
      const startDate = new Date(`${customStartDate}T00:00:00`);
      const endDate = new Date(`${customEndDate}T23:59:59`);
      const diffDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)));

      for (let i = 0; i < diffDays; i++) {
        const dayDate = new Date(startDate.getTime() + i * 24 * 3600 * 1000);
        const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0);
        const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59);
        const label = dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

        let mobile = 0;
        let web = 0;
        timeframeFilteredLogs.forEach((log) => {
          const dt = new Date(log.createdAt);
          if (dt >= dayStart && dt <= dayEnd) {
            if (log.platform === 'mobile') mobile++;
            else web++;
          }
        });
        points.push({ label, mobile, web, total: mobile + web });
      }
    } else {
      const now = new Date();
      const numDays = timeFrame === '7d' ? 7 : timeFrame === '30d' ? 30 : 14;
      for (let i = numDays - 1; i >= 0; i--) {
        const dayDate = new Date(now.getTime() - i * 24 * 3600 * 1000);
        const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0);
        const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59);
        const label = dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

        let mobile = 0;
        let web = 0;
        timeframeFilteredLogs.forEach((log) => {
          const dt = new Date(log.createdAt);
          if (dt >= dayStart && dt <= dayEnd) {
            if (log.platform === 'mobile') mobile++;
            else web++;
          }
        });
        points.push({ label, mobile, web, total: mobile + web });
      }
    }

    return points;
  }, [timeframeFilteredLogs, timeFrame, customStartDate, customEndDate]);

  const activeTimeframeLabel = useMemo(() => {
    if (timeFrame === 'custom') {
      return `${customStartDate} to ${customEndDate}`;
    }
    return TIMEFRAMES.find((t) => t.id === timeFrame)?.label || 'Selected Timeframe';
  }, [timeFrame, customStartDate, customEndDate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Error Banner */}
      {error && (
        <div
          className="admin-error-banner"
          style={{
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#EF4444" />
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#EF4444' }}>
                Traffic Telemetry Error
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {error}
              </div>
            </div>
          </div>
          <button
            onClick={loadInvoices}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#fff',
              background: '#EF4444',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="page-header-row" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Activity size={22} color="var(--accent-blue)" />
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                Traffic Analytics &amp; Invoice Creation Numbers
              </h2>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Tracking invoice creation numbers and platform distribution across Mobile App and Web App over time.
            </p>
          </div>

          {/* Timeframe & Custom Date Selector */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div className="timeframe-pills" style={{ background: 'var(--tab-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--tab-border)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={13} color="var(--accent-blue)" />
                Timeframe:
              </span>
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setTimeFrame(tf.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: timeFrame === tf.id ? 'var(--accent-blue)' : 'transparent',
                    color: timeFrame === tf.id ? '#FFFFFF' : 'var(--text-muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers Bar (Visible when timeFrame === 'custom') */}
            {timeFrame === 'custom' && (
              <div
                className="custom-date-range"
                style={{
                  background: 'var(--bg-main)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--accent-blue)',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '0.75rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3 Top Cards: Total, Mobile App, Web App */}
      <div className="traffic-metric-grid">
        {/* Card 1: Total Invoices */}
        <div className="glass-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', color: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                Total Invoices Made
              </span>
            </div>
            <Zap size={16} opacity={0.85} />
          </div>
          <div style={{ margin: '12px 0 4px 0', fontSize: '2.2rem', fontWeight: 800 }}>
            {metrics.totalCount.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.85 }}>invoices</span>
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.9 }}>
            Combined Mobile &amp; Web ({activeTimeframeLabel})
          </div>
        </div>

        {/* Card 2: Mobile App Invoices */}
        <div className="glass-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Smartphone size={18} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                Mobile App Invoices
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '9999px' }}>
              {metrics.mobileShare}% Share
            </span>
          </div>
          <div style={{ margin: '12px 0 4px 0', fontSize: '2.2rem', fontWeight: 800 }}>
            {metrics.mobileCount.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.85 }}>invoices</span>
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.9 }}>
            Created via Mobile POS App
          </div>
        </div>

        {/* Card 3: Web App Invoices */}
        <div className="glass-card" style={{ padding: '20px', background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)', color: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                Web App Invoices
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '9999px' }}>
              {metrics.webShare}% Share
            </span>
          </div>
          <div style={{ margin: '12px 0 4px 0', fontSize: '2.2rem', fontWeight: 800 }}>
            {metrics.webCount.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 500, opacity: 0.85 }}>invoices</span>
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.9 }}>
            Created via Web Dashboard
          </div>
        </div>
      </div>

      {/* Timeline View Chart: Mobile App vs Web Traffic over time */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="page-header-row" style={{ marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="var(--accent-blue)" />
              Invoice Creation Timeline Comparison ({activeTimeframeLabel})
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Timeline breakdown comparing invoice creation numbers between Mobile App and Web App over time.
            </p>
          </div>
        </div>

        <div style={{ height: '280px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mobileTrafficGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="webTrafficGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.5} />
              <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  fontSize: '0.8rem',
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '0.78rem' }} />
              <Area type="monotone" name="Mobile App Invoices" dataKey="mobile" stroke="#10B981" strokeWidth={2.5} fillOpacity={1} fill="url(#mobileTrafficGrad)" />
              <Area type="monotone" name="Web App Invoices" dataKey="web" stroke="#06B6D4" strokeWidth={2.5} fillOpacity={1} fill="url(#webTrafficGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
