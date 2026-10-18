import React, { useEffect, useState } from 'react';
import {
  Activity,
  Users,
  Gauge,
  Zap,
  BadgeCheck,
  UserX,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { SectionUsageChart } from './SectionUsageChart';
import { TimeRangeSelect } from './TimeRangeSelect';
import { BusinessProfileAnalytics } from './BusinessProfileAnalytics';
import { fetchSectionUsage, fetchSectionsSummary } from '../services/api';
import type { SectionUsage, SectionsSummary } from '../types/admin';

interface SectionUsageSectionProps {
  title: string;
  limit?: number;
  showInsights?: boolean;
  compact?: boolean;
  embedded?: boolean;
  timeRange?: string;
  hideTimeRangeSelect?: boolean;
  onViewAllSessions?: () => void;
}

const emptySummary: SectionsSummary = {
  totalApiCalls: 0,
  totalApiCallsTrend: 0,
  activeUserCount: 0,
  avgApiCallsPerUser: 0,
  mostUsedApi: null,
  seznikUserCount: 0,
  nonSeznikUserCount: 0,
  timeRange: 'all',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  minWidth: 0,
};

function SummaryMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  trend?: number;
}) {
  const showTrend = trend != null && Number.isFinite(trend);
  const up = (trend || 0) >= 0;
  return (
    <div style={cardStyle} className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>{title}</span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${accent}18`,
            border: `1px solid ${accent}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={15} color={accent} />
        </div>
      </div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {subtitle ? (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{subtitle}</span>
        ) : null}
        {showTrend ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.72rem',
              fontWeight: 600,
              color: up ? '#10B981' : '#EF4444',
            }}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}
            {trend}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const SectionUsageSection: React.FC<SectionUsageSectionProps> = ({
  title,
  limit,
  showInsights = false,
  compact = false,
  embedded = false,
  timeRange: timeRangeProp,
  hideTimeRangeSelect = false,
  onViewAllSessions,
}) => {
  const [internalRange, setInternalRange] = useState('all');
  const timeRange = timeRangeProp ?? internalRange;
  const setTimeRange = (value: string) => {
    if (timeRangeProp === undefined) setInternalRange(value);
  };
  const [sections, setSections] = useState<SectionUsage[]>([]);
  const [summary, setSummary] = useState<SectionsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        if (embedded) {
          const data = await fetchSectionUsage(timeRange);
          if (!cancelled) setSections(data);
          return;
        }

        const [sectionData, summaryData] = await Promise.all([
          fetchSectionUsage(timeRange),
          fetchSectionsSummary(timeRange),
        ]);
        if (!cancelled) {
          setSections(sectionData);
          setSummary(summaryData);
        }
      } catch {
        if (!cancelled) {
          setSections([]);
          if (!embedded) setSummary({ ...emptySummary, timeRange });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [timeRange, embedded]);

  if (loading && sections.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: embedded ? '100%' : '160px' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px' }} />
      </div>
    );
  }

  // Compact / overview embed keeps the original chart-only experience
  if (embedded) {
    return (
      <div className="section-usage-embedded">
        {!hideTimeRangeSelect && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <TimeRangeSelect value={timeRange} onChange={setTimeRange} compact />
          </div>
        )}
        <SectionUsageChart
          title={title}
          sections={limit != null ? sections.slice(0, limit) : sections}
          showInsights={showInsights}
          compact={compact}
          isCollapsible={false}
          headerExtra={!hideTimeRangeSelect ? <TimeRangeSelect value={timeRange} onChange={setTimeRange} compact /> : undefined}
          onViewAllSessions={onViewAllSessions}
        />
      </div>
    );
  }

  const mostUsedLabel = summary.mostUsedApi?.sectionName || '—';
  const mostUsedSub = summary.mostUsedApi
    ? `${summary.mostUsedApi.viewCount.toLocaleString()} calls · ${summary.mostUsedApi.percentageShare}% share`
    : 'No API traffic yet';

  return (
    <div className="admin-page-stack sections-analytics-page" style={{ gap: '16px' }}>
      {!hideTimeRangeSelect && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <TimeRangeSelect value={timeRange} onChange={setTimeRange} compact />
        </div>
      )}

      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
          Section & Feature Traffic
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          API usage overview, business profiles, and Seznik vs Non-Seznik merchants
        </p>
      </div>

      <div
        className="sections-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '12px',
        }}
      >
        <SummaryMetricCard
          title="Total API Calls"
          value={summary.totalApiCalls.toLocaleString()}
          subtitle="In selected range"
          icon={Activity}
          accent="#3B82F6"
          trend={summary.totalApiCallsTrend}
        />
        <SummaryMetricCard
          title="Users Who Used It"
          value={summary.activeUserCount.toLocaleString()}
          subtitle="Merchants with ≥1 sale"
          icon={Users}
          accent="#8B5CF6"
        />
        <SummaryMetricCard
          title="Avg API Calls / User"
          value={summary.avgApiCallsPerUser.toLocaleString()}
          subtitle="Total calls ÷ active merchants"
          icon={Gauge}
          accent="#F59E0B"
        />
        <SummaryMetricCard
          title="Most Used API"
          value={mostUsedLabel}
          subtitle={mostUsedSub}
          icon={Zap}
          accent="#10B981"
        />
      </div>

      <div
        className="sections-mid-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 0.8fr)',
          gap: '14px',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: '18px 20px',
            height: '100%',
          }}
        >
          <BusinessProfileAnalytics timeRange={timeRange} embedded />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            height: '100%',
            minHeight: 0,
          }}
        >
          <div
            style={{
              ...cardStyle,
              borderColor: 'rgba(37, 99, 235, 0.35)',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Seznik Users</span>
              <BadgeCheck size={18} color="#2563EB" />
            </div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {summary.seznikUserCount.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Merchants marked as Seznik users
            </span>
          </div>

          <div
            style={{
              ...cardStyle,
              borderColor: 'rgba(100, 116, 139, 0.35)',
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>Non-Seznik Users</span>
              <UserX size={18} color="#64748B" />
            </div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {summary.nonSeznikUserCount.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              All other registered merchants
            </span>
          </div>
        </div>
      </div>

      <SectionUsageChart
        title={title}
        sections={limit != null ? sections.slice(0, limit) : sections}
        showInsights={showInsights}
        compact={compact}
        isCollapsible={false}
        onViewAllSessions={onViewAllSessions}
      />
    </div>
  );
};
