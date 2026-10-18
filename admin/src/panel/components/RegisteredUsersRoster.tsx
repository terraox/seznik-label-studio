import React from 'react';
import { Users, UserCheck, ArrowRight, Shield } from 'lucide-react';
import type { UserRecord } from '../types/admin';
import { EmptyState } from './EmptyState';

interface RegisteredUsersRosterProps {
  users?: UserRecord[];
  onViewAll?: () => void;
}

export const RegisteredUsersRoster: React.FC<RegisteredUsersRosterProps> = ({ users = [], onViewAll }) => {
  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="#8B5CF6" />
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Registered Merchant Users Roster
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Quick overview of administrative accounts, assigned roles, and activity status.
          </p>
        </div>

        {onViewAll && (
          <button
            onClick={onViewAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              color: '#2563EB',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '6px',
              transition: 'background 0.15s ease',
            }}
          >
            <span>View all users</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Registered Users"
          message="No registered merchant accounts found in the database."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Business Name</th>
                <th>Joined Date</th>
                <th>Verification Status</th>
              </tr>
            </thead>
            <tbody>
              {users.slice(0, 6).map((u) => {
                const name = u.displayName || u.email || 'User';
                const initial = name.charAt(0).toUpperCase();

                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            fontSize: '0.85rem',
                          }}
                        >
                          {initial}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email || u.phone || 'No contact'}</div>
                          {u.printerName ? (
                            <div style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 600, marginTop: 2 }}>
                              Printer · {u.printerName}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Shield size={12} color="#8B5CF6" />
                        <span>{u.role}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500 }}>
                        {u.businessName || 'Independent'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                      </span>
                    </td>
                    <td>
                      {u.emailVerified ? (
                        <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
                          <UserCheck size={12} /> Verified
                        </span>
                      ) : (
                        <span className="badge badge-free" style={{ fontSize: '0.7rem' }}>
                          Unverified
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
