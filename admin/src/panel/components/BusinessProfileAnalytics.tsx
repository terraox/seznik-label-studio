import React, { useEffect, useState } from 'react';
import { ArrowLeft, Store, TrendingUp, TrendingDown, Users, Activity } from 'lucide-react';
import { SectionUsageChart } from './SectionUsageChart';
import { fetchBusinessProfiles, fetchProfileSectionUsage } from '../services/api';
import type { BusinessProfileSummary, SectionUsage } from '../types/admin';

interface BusinessProfileAnalyticsProps {
  timeRange?: string;
  /** When true, omit the standalone page heading (used inside Sections tab). */
  embedded?: boolean;
}

const PROFILE_COLORS: Record<string, string> = {
  restaurant_cafe: '#F59E0B',
  online_store: '#3B82F6',
  retail_shop: '#10B981',
  unknown: '#64748B',
};

export const BusinessProfileAnalytics: React.FC<BusinessProfileAnalyticsProps> = ({
  timeRange = 'all',
  embedded = false,
}) => {
  const [profiles, setProfiles] = useState<BusinessProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionUsage[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedType(null);
    fetchBusinessProfiles(timeRange)
      .then((data) => {
        if (!cancelled) setProfiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  useEffect(() => {
    if (!selectedType) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setSectionsLoading(true);
    fetchProfileSectionUsage(selectedType, timeRange)
      .then((data) => {
        if (!cancelled) setSections(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      })
      .finally(() => {
        if (!cancelled) setSectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedType, timeRange]);

  const selectedProfile = profiles.find((p) => p.businessType === selectedType) || null;

  if (loading && profiles.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px' }} />
      </div>
    );
  }

  if (selectedType && selectedProfile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedType(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <ArrowLeft size={14} />
            All profiles
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
              {selectedProfile.label}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {selectedProfile.userCount.toLocaleString()} merchants ·{' '}
              {selectedProfile.totalApiCalls.toLocaleString()} API calls in selected range
            </div>
          </div>
        </div>

        {sectionsLoading && sections.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px' }}>
            <div className="pulse-dot" style={{ width: '12px', height: '12px' }} />
          </div>
        ) : (
          <SectionUsageChart
            title={`${selectedProfile.label} — Feature API Usage`}
            sections={sections}
            compact={false}
            hideHeaderButton
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!embedded && (
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Advanced Analytics by Business Profile
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            API request volume grouped by registered business type. Click a profile to see per-feature usage.
          </p>
        </div>
      )}

      {embedded && (
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Business Profiles
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Click a profile to drill into feature usage
          </p>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {profiles.map((profile) => {
          const color = PROFILE_COLORS[profile.businessType] || '#64748B';
          const trendUp = (profile.totalApiCallsTrend || 0) >= 0;
          const TrendIcon = trendUp ? TrendingUp : TrendingDown;

          return (
            <button
              key={profile.businessType}
              type="button"
              onClick={() => setSelectedType(profile.businessType)}
              className="glass-card"
              style={{
                textAlign: 'left',
                padding: '18px 20px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                  {profile.label}
                </span>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: `${color}20`,
                    border: `1px solid ${color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Store size={16} color={color} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                  {profile.totalApiCalls.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  API calls in selected range
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={12} />
                  {profile.userCount.toLocaleString()} merchants
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: trendUp ? '#10B981' : '#EF4444' }}>
                  <TrendIcon size={12} />
                  {trendUp ? '+' : ''}
                  {profile.totalApiCallsTrend}%
                </span>
                {profile.topFeature ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Activity size={12} />
                    Top: {profile.topFeature.sectionName}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {profiles.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No business profile analytics available yet.
        </div>
      ) : null}
    </div>
  );
};
