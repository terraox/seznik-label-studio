import React, { useEffect, useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import type { DeviceSessionBreakdownData } from '../types/admin';
import { fetchDeviceSessionBreakdown } from '../services/api';
import { EmptyState } from './EmptyState';
import { TimeRangeSelect, timeRangeLabel } from './TimeRangeSelect';

export const DeviceSessionBreakdown: React.FC<{
  embedded?: boolean;
  timeRange?: string;
  hideTimeRangeSelect?: boolean;
}> = ({ embedded = false, timeRange: timeRangeProp, hideTimeRangeSelect = false }) => {
  const [internalRange, setInternalRange] = useState('all');
  const timeRange = timeRangeProp ?? internalRange;
  const setTimeRange = (value: string) => {
    if (timeRangeProp === undefined) setInternalRange(value);
  };
  const [data, setData] = useState<DeviceSessionBreakdownData | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDeviceSessionBreakdown(timeRange)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setData(undefined);
          setError(err?.message || 'Failed to load platform data');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  if (loading && !data) {
    return (
      <div className={`glass-card${embedded ? ' device-panel--embedded' : ''}`} style={{ padding: embedded ? '12px 14px' : '18px 22px', height: '100%', minHeight: 0, boxSizing: 'border-box', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="pulse-dot" style={{ width: '12px', height: '12px' }} />
      </div>
    );
  }

  if (error || !data || (data.totalInvoices ?? 0) === 0) {
    return (
      <div className={`glass-card${embedded ? ' device-panel--embedded' : ''}`} style={{ padding: embedded ? '12px 14px' : '18px 22px', height: '100%', minHeight: 0, boxSizing: 'border-box', flex: 1 }}>
        <div className="device-panel-header" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Laptop size={17} color="#8B5CF6" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Device &amp; Session Breakdown
            </h3>
          </div>
          {!hideTimeRangeSelect && <TimeRangeSelect value={timeRange} onChange={setTimeRange} compact />}
        </div>
        <EmptyState
          title="No Platform Data"
          message={error || `No invoices in ${timeRangeLabel(timeRange).toLowerCase()}.`}
        />
      </div>
    );
  }

  const d = data;

  return (
    <div
      className={`glass-card${embedded ? ' device-panel--embedded' : ''}`}
      style={{
        padding: embedded ? '12px 14px' : '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
        flex: 1,
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <div className="device-panel-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={17} color="#8B5CF6" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Device &amp; Session Breakdown
              </h3>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Invoice distribution across web and mobile · {timeRangeLabel(timeRange)}
            </p>
          </div>
          {!hideTimeRangeSelect && <TimeRangeSelect value={timeRange} onChange={setTimeRange} compact />}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center', margin: '6px 0' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Invoices by Platform Channel
            </h4>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {d.totalInvoices !== undefined ? `${d.totalInvoices} total` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--border-color)' }}>
            {d.desktopPercent > 0 && <div style={{ width: `${d.desktopPercent}%`, background: '#3B82F6', borderRadius: '2px', transition: 'width 0.3s ease' }} title={`Web: ${d.desktopPercent}%`} />}
            {d.mobilePercent > 0 && <div style={{ width: `${d.mobilePercent}%`, background: '#10B981', borderRadius: '2px', transition: 'width 0.3s ease' }} title={`Mobile: ${d.mobilePercent}%`} />}
          </div>

          <div className="device-panel-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            <div style={{ background: 'var(--bg-card-hover)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Laptop size={14} color="#3B82F6" /> Web (Browser POS)
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.05rem', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                {d.desktopPercent}% <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>({d.desktopCount} invoices)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card-hover)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <Smartphone size={14} color="#10B981" /> Mobile App
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.05rem', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                {d.mobilePercent}% <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>({d.mobileCount} invoices)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
