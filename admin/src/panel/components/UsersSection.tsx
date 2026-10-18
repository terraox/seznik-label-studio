import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { UserManagementView } from './UserManagementView';
import { fetchUserRecords } from '../services/api';
import type { UserRecord } from '../types/admin';

interface UsersSectionProps {
  initialSearchTerm?: string | null;
}

export const UsersSection: React.FC<UsersSectionProps> = ({ initialSearchTerm }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchUserRecords('all');
      setUsers(data);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Database connection error or failed request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>

      {errorMessage && (
        <div
          className="admin-error-banner"
          style={{
            marginBottom: '14px',
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="#EF4444" />
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#EF4444' }}>Database Error</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{errorMessage}</div>
            </div>
          </div>
          <button
            onClick={() => loadUsers()}
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

      {loading && users.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="pulse-dot" style={{ width: '16px', height: '16px' }} />
          <span style={{ marginLeft: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading users...</span>
        </div>
      ) : (
        <UserManagementView
          users={users}
          initialSearchTerm={initialSearchTerm}
          onRefreshUsers={() => loadUsers()}
        />
      )}
    </div>
  );
};
