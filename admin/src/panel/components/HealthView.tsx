import React, { useCallback, useEffect, useState } from 'react';
import {
  HeartPulse,
  RefreshCw,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  HardDrive,
} from 'lucide-react';
import { fetchAdminHealth, fetchBackendHealth } from '../services/api';
import type { HealthCheckResult } from '../types/admin';

type ServiceHealth = {
  label: string;
  description: string;
  result: HealthCheckResult | null;
};

function formatUptime(seconds?: number): string {
  if (seconds == null) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${seconds % 60}s`;
}

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown' | 'checking';

function StatusBadge({ status }: { status: HealthStatus }) {
  const styles: Record<HealthStatus, { className: string; label: string; icon: React.ReactNode }> = {
    healthy: {
      className: 'badge badge-active',
      label: 'Healthy',
      icon: <CheckCircle2 size={13} />,
    },
    unhealthy: {
      className: 'badge badge-failed',
      label: 'Unhealthy',
      icon: <XCircle size={13} />,
    },
    unknown: {
      className: 'badge badge-free',
      label: 'Not checked',
      icon: <Clock size={13} />,
    },
    checking: {
      className: 'badge badge-free',
      label: 'Checking…',
      icon: <RefreshCw size={13} className="animate-spin-slow" />,
    },
  };

  const config = styles[status];
  const isNeutral = status === 'unknown' || status === 'checking';

  return (
    <span
      className={config.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.78rem',
        fontWeight: 700,
        padding: '4px 10px',
        color: isNeutral ? 'var(--text-muted)' : undefined,
      }}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--card-border)',
        fontSize: '0.82rem',
      }}
    >
      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ color: accent || 'var(--text-main)', fontWeight: 600, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function ServiceCard({ service, checking }: { service: ServiceHealth; checking: boolean }) {
  const result = service.result;
  const checked = result != null;
  const healthy = result?.status === 'healthy';
  const status: HealthStatus = !checked ? 'unknown' : healthy ? 'healthy' : 'unhealthy';
  const dbHealthy = result?.database?.status === 'connected';

  const borderColor =
    status === 'healthy'
      ? 'rgba(16, 185, 129, 0.3)'
      : status === 'unhealthy'
        ? 'rgba(239, 68, 68, 0.35)'
        : 'var(--card-border)';
  const iconBg =
    status === 'healthy'
      ? 'rgba(16, 185, 129, 0.12)'
      : status === 'unhealthy'
        ? 'rgba(239, 68, 68, 0.12)'
        : 'var(--tab-bg)';
  const iconColor =
    status === 'healthy' ? '#10B981' : status === 'unhealthy' ? '#EF4444' : 'var(--text-muted)';

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Server size={20} color={iconColor} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {service.label}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              {service.description}
            </p>
          </div>
        </div>
        <StatusBadge status={checking && !checked ? 'checking' : status} />
      </div>

      {!result ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {checking ? (
            <>
              <RefreshCw size={14} className="animate-spin-slow" />
              Checking service availability...
            </>
          ) : (
            'Not checked yet. Click "Run Health Check" to probe this service.'
          )}
        </p>
      ) : (
        <div>
          <MetricRow
            label="Server response"
            value={result.serverLatencyMs != null ? `${result.serverLatencyMs} ms` : '—'}
            accent={healthy ? '#10B981' : '#EF4444'}
          />
          <MetricRow
            label="Database"
            value={dbHealthy ? `Connected (${result.database?.latencyMs ?? '—'} ms)` : 'Disconnected'}
            accent={dbHealthy ? '#10B981' : '#EF4444'}
          />
          {result.uptimeSeconds != null && (
            <MetricRow label="Uptime" value={formatUptime(result.uptimeSeconds)} />
          )}
          {result.memoryUsageMb != null && (
            <MetricRow label="Memory (RSS)" value={`${result.memoryUsageMb} MB`} />
          )}
          {result.environment && <MetricRow label="Environment" value={result.environment} />}
          {result.port != null && <MetricRow label="Port" value={String(result.port)} />}
          {result.timestamp && (
            <MetricRow
              label="Checked at"
              value={new Date(result.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            />
          )}
          {result.error && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                fontSize: '0.78rem',
                color: '#EF4444',
              }}
            >
              {result.error}
            </div>
          )}
          {result.database?.error && !result.error && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                fontSize: '0.78rem',
                color: '#EF4444',
              }}
            >
              DB: {result.database.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const HealthView: React.FC = () => {
  const [adminHealth, setAdminHealth] = useState<HealthCheckResult | null>(null);
  const [backendHealth, setBackendHealth] = useState<HealthCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    setLoading(true);
    try {
      const [admin, backend] = await Promise.all([fetchAdminHealth(), fetchBackendHealth()]);
      setAdminHealth(admin);
      setBackendHealth(backend);
      setLastCheckedAt(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const allHealthy =
    adminHealth?.status === 'healthy' &&
    backendHealth?.status === 'healthy' &&
    adminHealth?.database?.status === 'connected' &&
    backendHealth?.database?.status === 'connected';

  const anyChecked = adminHealth !== null || backendHealth !== null;

  const services: ServiceHealth[] = [
    {
      label: 'Admin API Server',
      description: 'Admin panel backend & PostgreSQL connection',
      result: adminHealth,
    },
    {
      label: 'POS Backend Server',
      description: 'Main application API & Prisma database',
      result: backendHealth,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '11px',
              background: 'rgba(59, 130, 246, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HeartPulse size={22} color="var(--accent-blue)" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
              System Health & Uptime
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Monitor server availability and database connectivity
            </p>
          </div>
        </div>

        <button
          onClick={runHealthCheck}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            fontSize: '0.84rem',
            fontWeight: 700,
            color: '#fff',
            background: loading ? 'var(--text-muted)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: '9px',
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : '0 2px 8px rgba(59,130,246,0.3)',
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin-slow' : undefined} />
          {loading ? 'Checking...' : 'Run Health Check'}
        </button>
      </div>

      {/* Overall status banner */}
      {anyChecked && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: '10px',
            background: allHealthy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${allHealthy ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {allHealthy ? (
              <CheckCircle2 size={22} color="#10B981" />
            ) : (
              <XCircle size={22} color="#EF4444" />
            )}
            <div>
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: allHealthy ? '#10B981' : '#EF4444',
                }}
              >
                {allHealthy ? 'All systems operational' : 'One or more systems are unhealthy'}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Admin server, POS backend, and database connections
              </div>
            </div>
          </div>
          {lastCheckedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              <Clock size={13} />
              Last checked: {lastCheckedAt} IST
            </div>
          )}
        </div>
      )}

      {/* Summary stats row */}
      {anyChecked && (
        <div className="health-stats-grid">
          {[
            { icon: Server, label: 'Services checked', value: '2', color: 'var(--accent-blue)' },
            {
              icon: Database,
              label: 'DB connections',
              value: `${[adminHealth, backendHealth].filter((h) => h?.database?.status === 'connected').length}/2`,
              color: '#10B981',
            },
            {
              icon: Activity,
              label: 'Avg response',
              value: (() => {
                const latencies = [adminHealth?.serverLatencyMs, backendHealth?.serverLatencyMs].filter(
                  (v): v is number => v != null,
                );
                if (latencies.length === 0) return '—';
                return `${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)} ms`;
              })(),
              color: '#F59E0B',
            },
            {
              icon: HardDrive,
              label: 'Admin memory',
              value: adminHealth?.memoryUsageMb != null ? `${adminHealth.memoryUsageMb} MB` : '—',
              color: '#8B5CF6',
            },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Icon size={18} color={color} />
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Service cards */}
      <div className="health-service-grid">
        {services.map((service) => (
          <ServiceCard key={service.label} service={service} checking={loading} />
        ))}
      </div>
    </div>
  );
};
