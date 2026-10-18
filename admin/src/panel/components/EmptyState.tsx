import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  title?: string;
  message?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title = 'No Data Recorded',
  message = 'No activity or telemetry data recorded in this window.',
}) => {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        background: 'var(--bg-card-hover)',
        borderRadius: '12px',
        border: '1px dashed #CBD5E1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'rgba(37, 99, 235, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
        }}
      >
        <Icon size={20} color="#2563EB" />
      </div>
      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
        {title}
      </h4>
      <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', maxWidth: '300px' }}>
        {message}
      </p>
    </div>
  );
};
