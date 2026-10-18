import React, { useEffect, useState } from 'react';
import { KPICards } from './KPICards';
import { fetchDashboardMetrics } from '../services/api';
import type { DashboardMetrics } from '../types/admin';

interface KPICardsSectionProps {
  onSelectTab?: (tab: string) => void;
  timeRange?: string;
}

export const KPICardsSection: React.FC<KPICardsSectionProps> = ({ onSelectTab, timeRange = 'all' }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDashboardMetrics(timeRange)
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  return (
    <div>
      {loading && !metrics ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px' }}>
          <div className="pulse-dot" style={{ width: '12px', height: '12px' }} />
        </div>
      ) : (
        <KPICards metrics={metrics} onSelectTab={onSelectTab} />
      )}
    </div>
  );
};
