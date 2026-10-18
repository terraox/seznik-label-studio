import React from 'react';
import { Users, Receipt, UserCheck, Activity } from 'lucide-react';
import type { DashboardMetrics } from '../types/admin';

interface KPICardsProps {
  metrics: DashboardMetrics | null;
  onSelectTab?: (tab: string, sectionId?: string) => void;
}

export const KPICards: React.FC<KPICardsProps> = ({ metrics, onSelectTab }) => {
  if (!metrics) return null;

  const mobileCount = metrics.mobileInvoicesCount ?? 0;
  const webCount = metrics.webInvoicesCount ?? 0;
  const mobilePct = metrics.mobileInvoicesPercent ?? 0;
  const webPct = metrics.webInvoicesPercent ?? 100;
  const windowLabel = metrics.timeWindowLabel || 'All Time';
  const isAllTime = (metrics.timeRange || 'all').toLowerCase() === 'all';
  const apiTrend = metrics.totalApiCallsTrend ?? 0;
  const apiTrendLabel =
    isAllTime
      ? 'All authenticated & public API requests'
      : `${apiTrend >= 0 ? '+' : ''}${apiTrend}% vs prior period`;

  const cards = [
    {
      id: 'users',
      title: isAllTime ? 'Total Registered Users' : `New Users (${windowLabel})`,
      value: metrics.totalUsers,
      subtext: isAllTime
        ? `${metrics.verifiedUserPercentage}% verified accounts`
        : 'Accounts created in this range',
      icon: Users,
      color: '#3B82F6',
      targetTab: 'users',
    },
    {
      id: 'invoices-today',
      title: `Invoices (${windowLabel})`,
      value: metrics.invoicesTodayCount ?? 0,
      subtext: `Web: ${webCount} (${webPct}%) • Mobile: ${mobileCount} (${mobilePct}%)`,
      icon: Receipt,
      color: '#10B981',
      targetTab: 'traffic',
    },
    {
      id: 'active-invoicing-users',
      title: `Active Merchants (${windowLabel})`,
      value: metrics.activeInvoicingUsersToday ?? 0,
      subtext: 'Distinct merchants with at least one invoice',
      icon: UserCheck,
      color: '#8B5CF6',
      targetTab: 'traffic',
    },
    {
      id: 'total-api-calls',
      title: `Total API Calls (${windowLabel})`,
      value: metrics.totalApiCalls ?? 0,
      subtext: apiTrendLabel,
      icon: Activity,
      color: '#F59E0B',
      targetTab: 'sections',
    },
  ];

  return (
    <div className="kpi-cards-grid">
      {cards.map((card, idx) => {
        const Icon = card.icon;

        return (
          <div
            key={idx}
            className="glass-card"
            onClick={() => {
              if (onSelectTab && card.targetTab) {
                onSelectTab(card.targetTab);
              }
            }}
            style={{
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: onSelectTab ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {card.title}
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `${card.color}20`,
                  border: `1px solid ${card.color}40`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={16} color={card.color} />
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: '1', letterSpacing: '-0.02em' }}>
                {Number(card.value).toLocaleString()}
              </div>
            </div>

            <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {card.subtext}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
