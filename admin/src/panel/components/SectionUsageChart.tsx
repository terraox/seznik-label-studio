import React from 'react';
import { 
  LayoutGrid, 
  ArrowRight, 
  Package, 
  ShoppingBag, 
  Layers, 
  Users, 
  Ticket, 
  Truck, 
  Receipt, 
  Settings, 
  CreditCard, 
  Building, 
  BookOpen, 
  BarChart3, 
  ShieldCheck, 
  Printer, 
  ChevronDown, 
  Calculator,
  MessageSquare,
  Tags,
  ChefHat,
  Store,
  Bell,
  FileText,
} from 'lucide-react';
import type { SectionUsage } from '../types/admin';
import { EmptyState } from './EmptyState';

interface SectionUsageChartProps {
  title?: string;
  sections?: SectionUsage[];
  showInsights?: boolean;
  compact?: boolean;
  hideHeaderButton?: boolean;
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onViewAllSessions?: (sectionId?: string) => void;
  headerExtra?: React.ReactNode;
}

const getModuleIcon = (iconName: string, path: string) => {
  if (path.includes('product') || iconName === 'Package') return <Package size={16} color="#3B82F6" />;
  if (path.includes('daybook') || iconName === 'BookOpen') return <BookOpen size={16} color="#10B981" />;
  if (path.includes('pos') || path.includes('sale') || iconName === 'ShoppingBag') return <ShoppingBag size={16} color="#06B6D4" />;
  if (path.includes('categor') || iconName === 'Layers') return <Layers size={16} color="#8B5CF6" />;
  if (path.includes('customer') || iconName === 'Users') return <Users size={15} color="#EC4899" />;
  if (path.includes('credit') || iconName === 'CreditCard') return <CreditCard size={16} color="#F59E0B" />;
  if (path.includes('onboarding') || path.includes('login') || path.includes('auth') || iconName === 'ShieldCheck') return <ShieldCheck size={16} color="#3B82F6" />;
  if (path.includes('token') || iconName === 'Ticket') return <Ticket size={16} color="#06B6D4" />;
  if (iconName === 'Tags') return <Tags size={16} color="#06B6D4" />;
  if (path.includes('setting') || iconName === 'Settings') return <Settings size={16} color="#64748B" />;
  if (path.includes('report') || iconName === 'BarChart3') return <BarChart3 size={16} color="#3B82F6" />;
  if (path.includes('purchase') || iconName === 'Truck') return <Truck size={16} color="#F59E0B" />;
  if (path.includes('supplier') || iconName === 'Building') return <Building size={16} color="#8B5CF6" />;
  if (path.includes('expense') || iconName === 'Receipt') return <Receipt size={16} color="#EF4444" />;
  if (path.includes('printer') || iconName === 'Printer') return <Printer size={16} color="#64748B" />;
  if (path.includes('feedback') || iconName === 'MessageSquare') return <MessageSquare size={16} color="#EC4899" />;
  if (path.includes('table') || path.includes('kot') || iconName === 'ChefHat') return <ChefHat size={16} color="#F59E0B" />;
  if (path.includes('store') || iconName === 'Store') return <Store size={16} color="#10B981" />;
  if (iconName === 'Bell') return <Bell size={16} color="#8B5CF6" />;
  if (path.includes('invoice') || iconName === 'FileText') return <FileText size={16} color="#64748B" />;
  if (iconName === 'Calculator') return <Calculator size={16} color="#06B6D4" />;
  return <LayoutGrid size={16} color="#3B82F6" />;
};

export const SectionUsageChart: React.FC<SectionUsageChartProps> = ({
  title = 'Top 5 Most Used Features',
  sections = [],
  compact = false,
  hideHeaderButton = false,
  isCollapsible = false,
  isExpanded = false,
  onToggleExpand,
  onViewAllSessions,
  headerExtra,
}) => {
  const topModule = sections[0] || null;
  const totalOperations = sections.reduce((acc, s) => acc + (s.viewCount || 0), 0);

  return (
    <div 
      className={`glass-card${compact ? ' section-chart--compact' : ''}`}
      style={{ 
        padding: compact ? '10px 16px' : '14px 22px', 
        width: '100%', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        flexShrink: 0,
      }}
    >
      {/* Header Bar - Always rendered consistently */}
      <div 
        onClick={isCollapsible && !isExpanded ? onToggleExpand : undefined}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          flexWrap: 'wrap', 
          gap: '10px',
          cursor: isCollapsible && !isExpanded ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '7px',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B',
              flexShrink: 0,
            }}
          >
            <LayoutGrid size={17} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
            {title}
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--accent-blue)',
              background: 'rgba(59, 130, 246, 0.1)',
              padding: '2px 8px',
              borderRadius: '10px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
            }}
          >
            {sections.length} Tracked Modules • {totalOperations.toLocaleString()} Total API Calls
          </span>
          {topModule && !compact && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
              • #1 Leader: <strong style={{ color: 'var(--text-main)' }}>{topModule.sectionName}</strong> ({topModule.viewCount.toLocaleString()} calls • {topModule.percentageShare}%)
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {headerExtra}
          {/* Toggle Button (Only when collapsed) */}
          {isCollapsible && onToggleExpand && !isExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: 'var(--accent-blue)',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Show Top 5 Features</span>
              <ChevronDown size={14} />
            </button>
          )}

          {!hideHeaderButton && onViewAllSessions && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewAllSessions();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '5px 10px',
                borderRadius: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>View All Sections</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Smooth Collapsible Body Container */}
      <div
        className="section-chart-body"
        style={{
          maxHeight: (!isCollapsible || isExpanded) ? (compact ? 'none' : '900px') : '0px',
          opacity: (!isCollapsible || isExpanded) ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin-top 0.35s ease',
          marginTop: (!isCollapsible || isExpanded) ? (compact ? '8px' : '12px') : '0px',
          flex: compact ? 1 : undefined,
          minHeight: compact ? 0 : undefined,
        }}
      >
        {sections.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No API Traffic Recorded"
            message="No API calls recorded in this window yet. Counts start after backend tracking is deployed."
          />
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
            <table className="custom-table" style={{ width: '100%', minWidth: '600px', tableLayout: 'auto', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 14px', textAlign: 'left', width: '52%', fontSize: '0.74rem' }}>Feature / API Route</th>
                  <th style={{ padding: '6px 14px', textAlign: 'left', width: '24%', fontSize: '0.74rem' }}>API Calls</th>
                  <th style={{ padding: '6px 14px', textAlign: 'left', width: '24%', fontSize: '0.74rem' }}>Traffic Share</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec, idx) => {
                  return (
                    <tr 
                      key={sec.id || idx}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      <td style={{ padding: compact ? '4px 10px' : '8px 14px', borderRadius: '6px 0 0 6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '10px' }}>
                          <div
                            style={{
                              width: compact ? '22px' : '26px',
                              height: compact ? '22px' : '26px',
                              borderRadius: '6px',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {getModuleIcon(sec.iconName, sec.path)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: compact ? '0.8rem' : '0.86rem' }}>
                              {sec.sectionName}
                            </div>
                            {!compact && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                <code
                                  style={{
                                    fontSize: '0.68rem',
                                    color: 'var(--accent-blue)',
                                    background: 'rgba(79, 142, 247, 0.1)',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {sec.apiRoute || sec.path}
                                </code>
                                {sec.apiRoute && sec.path ? (
                                  <code
                                    style={{
                                      fontSize: '0.68rem',
                                      color: 'var(--text-muted)',
                                      background: 'rgba(148, 163, 184, 0.12)',
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    UI {sec.path}
                                  </code>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {sec.viewCount.toLocaleString()}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            calls
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '8px 14px', borderRadius: '0 6px 6px 0' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {sec.percentageShare}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
