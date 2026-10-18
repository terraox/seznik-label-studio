import React, { useState } from 'react';
import {
  Users,
  Mail,
  Phone,
  Building2,
  Search,
  ShieldAlert,
  Ban,
  CheckCircle2,
  UserCheck,
  X,
  User,
  Calendar,
  Clock,
  Layers,
  Scroll,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type { UserRecord } from '../types/admin';
import { banUser, unbanUser, setSeznikUser } from '../services/api';
import {
  getRegistrationSource,
  getRegistrationSourceLabel,
  getRegistrationSourceStyle,
  type RegistrationSource,
} from '../utils/registrationSource';

interface UserManagementViewProps {
  users: UserRecord[];
  initialSearchTerm?: string | null;
  onBanUser?: (userId: string | number, reason: string) => void;
  onRefreshUsers?: () => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  initialSearchTerm,
  onBanUser,
  onRefreshUsers,
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [sourceFilter, setSourceFilter] = useState<'all' | RegistrationSource>('all');
  const [viewMode, setViewMode] = useState<'paginated' | 'scroll'>('paginated');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  React.useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize, sourceFilter]);

  // Modal State for User Profile Details
  const [selectedUserForProfile, setSelectedUserForProfile] = useState<UserRecord | null>(null);

  // Modal State for Ban User
  const [selectedUserForBan, setSelectedUserForBan] = useState<UserRecord | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>('Suspicious activity or unauthorized access');
  const [customReason, setCustomReason] = useState<string>('');

  // Local state for tracking real-time ban overrides
  const [bannedMap, setBannedMap] = useState<Record<string | number, { banned: boolean; reason: string }>>({});
  const [seznikMap, setSeznikMap] = useState<Record<string | number, boolean>>({});
  const [seznikBusyId, setSeznikBusyId] = useState<string | number | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConfirmBan = async () => {
    if (!selectedUserForBan) return;
    const finalReason = selectedReason === 'Custom Reason' ? customReason : selectedReason;
    const userId = selectedUserForBan.id;

    setActionLoading(true);
    setActionError(null);
    try {
      await banUser(userId, finalReason || 'Account suspended by system administrator');
      setBannedMap((prev) => ({
        ...prev,
        [userId]: {
          banned: true,
          reason: finalReason || 'Account suspended by system administrator',
        },
      }));

      if (onBanUser) {
        onBanUser(userId, finalReason);
      }
      if (onRefreshUsers) {
        onRefreshUsers();
      }

      setSelectedUserForBan(null);
      setCustomReason('');
    } catch (err: any) {
      console.error('Error banning user:', err);
      setActionError(err?.message || 'Failed to ban user on database');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnban = async (userId: string | number) => {
    setActionLoading(true);
    setActionError(null);
    try {
      await unbanUser(userId);
      setBannedMap((prev) => ({
        ...prev,
        [userId]: { banned: false, reason: '' },
      }));

      if (onRefreshUsers) {
        onRefreshUsers();
      }
    } catch (err: any) {
      console.error('Error unbanning user:', err);
      setActionError(err?.message || 'Failed to unban user on database');
    } finally {
      setActionLoading(false);
    }
  };

  const isSeznikUser = (u: UserRecord) =>
    seznikMap[u.id] !== undefined ? seznikMap[u.id] : Boolean(u.seznikUser);

  const handleToggleSeznik = async (u: UserRecord) => {
    const next = !isSeznikUser(u);
    setSeznikBusyId(u.id);
    setActionError(null);
    try {
      await setSeznikUser(u.id, next);
      setSeznikMap((prev) => ({ ...prev, [u.id]: next }));
      if (onRefreshUsers) onRefreshUsers();
    } catch (err: any) {
      console.error('Error updating Seznik flag:', err);
      setActionError(err?.message || 'Failed to update Seznik flag');
    } finally {
      setSeznikBusyId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      String(u.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.uid || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.businessName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (u.phone || '').includes(searchTerm);

    const matchesSource =
      sourceFilter === 'all' || getRegistrationSource(u.id) === sourceFilter;

    return matchesSearch && matchesSource;
  });

  // Pagination Calculations
  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const displayedUsers =
    viewMode === 'paginated' ? filteredUsers.slice(startIndex, endIndex) : filteredUsers;

  const predefinedReasons = [
    'Suspicious activity or unauthorized access',
    'Violation of Terms of Service / System Abuse',
    'Fraudulent payment or billing dispute',
    'Excessive failed security authentications',
    'Custom Reason',
  ];

  return (
    <div className="glass-card user-mgmt-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={22} color="var(--accent-blue)" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Registered Merchant Users
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Full merchant user roster with User Profile Details, account privileges, instant ban controls, and flexible view layouts.
          </p>
        </div>

        {/* Filter & View Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* View Mode Toggle: Paginated vs Scroll View */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-main)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setViewMode('paginated')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'paginated' ? 'var(--accent-blue)' : 'transparent',
                color: viewMode === 'paginated' ? '#FFFFFF' : 'var(--text-muted)',
                fontWeight: viewMode === 'paginated' ? 600 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Paginated View (Navigate with pages)"
            >
              <Layers size={14} />
              <span>Paginated</span>
            </button>
            <button
              onClick={() => setViewMode('scroll')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: viewMode === 'scroll' ? 'var(--accent-blue)' : 'transparent',
                color: viewMode === 'scroll' ? '#FFFFFF' : 'var(--text-muted)',
                fontWeight: viewMode === 'scroll' ? 600 : 500,
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="Scroll View (Continuous scroll list)"
            >
              <Scroll size={14} />
              <span>Scroll View</span>
            </button>
          </div>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | RegistrationSource)}
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              outline: 'none',
              cursor: 'pointer',
            }}
            aria-label="Filter by registration source"
          >
            <option value="all">All Sources</option>
            <option value="web">Web</option>
            <option value="mobile">Mobile</option>
            <option value="legacy">Legacy</option>
          </select>

          {/* Search Input */}
          <div className="user-mgmt-search">
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search ID, name, email, phone, store..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 34px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.8rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* Single Dedicated Total Registered Users Card */}
      <div
        style={{
          background: 'var(--bg-main)',
          padding: '18px 22px',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.15) 0%, rgba(6, 182, 212, 0.15) 100%)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3B82F6',
            }}
          >
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Total Registered Users
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px', lineHeight: 1 }}>
                {users.length}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Merchant Accounts in Database
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#10B981', fontWeight: 600 }}>
          <span className="pulse-dot" style={{ width: '6px', height: '6px' }}></span>
          <span>Live AWS RDS Database Connection</span>
        </div>
      </div>

      {/* Users Table Container (with Scroll View support) */}
      <div
        className="users-desktop-table"
        style={{
          width: '100%',
          overflowX: 'auto',
          transition: 'all 0.25s ease',
          ...(viewMode === 'scroll'
            ? {
                minHeight: '480px',
                maxHeight: '720px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.01)',
              }
            : {}),
        }}
      >
        <table className="custom-table users-roster-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                ...(viewMode === 'scroll'
                  ? {
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: 'var(--bg-card)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    }
                  : {}),
              }}
            >
              <th>User ID</th>
              <th>Source</th>
              <th>User Name &amp; Email</th>
              <th>Business Name</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Joined Date</th>
              <th>Account Status</th>
              <th>Seznik</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedUsers.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No merchant users match your search criteria.
                </td>
              </tr>
            ) : (
              displayedUsers.map((u) => {
                const banInfo = bannedMap[u.id];
                const isUserBanned = banInfo?.banned || u.isBanned;
                const banReasonText = banInfo?.reason || u.banReason || 'Account suspended by admin';
                const registrationSource = getRegistrationSource(u.id);
                const sourceStyle = getRegistrationSourceStyle(registrationSource);
                const seznik = isSeznikUser(u);
                const seznikBusy = seznikBusyId === u.id;

                return (
                  <tr key={u.id}>
                    <td>
                      <code style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }} title={String(u.id)}>
                        #{typeof u.id === 'string' && u.id.length > 8 ? `${u.id.slice(0, 8)}…` : u.id}
                      </code>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: sourceStyle.color,
                          background: sourceStyle.background,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {getRegistrationSourceLabel(registrationSource)}
                      </span>
                    </td>
                    <td>
                      <div style={{ cursor: 'pointer' }} onClick={() => setSelectedUserForProfile(u)}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {u.displayName || 'No Name'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={12} /> {u.email || 'No Email'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <Building2 size={14} color="var(--accent-blue)" />
                        <span>{u.businessName || 'Independent'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <Phone size={12} />
                        <span>{u.phone || 'N/A'}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        <span>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                      </div>
                    </td>
                    <td>
                      {isUserBanned ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-failed">
                            <ShieldAlert size={12} /> Banned
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#F87171', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={banReasonText}>
                            {banReasonText}
                          </span>
                        </div>
                      ) : u.emailVerified ? (
                        <span className="badge badge-active">
                          <UserCheck size={12} /> Verified
                        </span>
                      ) : (
                        <span className="badge badge-free">
                          Unverified
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void handleToggleSeznik(u)}
                        disabled={seznikBusy}
                        title={seznik ? 'Click to mark as Non-Seznik' : 'Click to mark as Seznik user'}
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '999px',
                          border: seznik ? '1px solid rgba(37,99,235,0.4)' : '1px solid var(--border-color)',
                          background: seznik ? 'rgba(37,99,235,0.12)' : 'var(--bg-main)',
                          color: seznik ? '#2563EB' : 'var(--text-muted)',
                          cursor: seznikBusy ? 'wait' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {seznikBusy ? '…' : seznik ? 'Seznik' : 'Non-Seznik'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        {/* View Profile Button */}
                        <button
                          onClick={() => setSelectedUserForProfile(u)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--accent-blue)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '5px 10px',
                            borderRadius: '6px',
                          }}
                        >
                          <User size={12} />
                          <span>View Profile</span>
                        </button>

                        {/* Ban / Unban Button */}
                        {isUserBanned ? (
                          <button
                            onClick={() => handleUnban(u.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: '#10B981',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '5px 10px',
                              borderRadius: '6px',
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>Unban</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedUserForBan(u)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'rgba(244, 63, 94, 0.15)',
                              border: '1px solid rgba(244, 63, 94, 0.3)',
                              color: '#F87171',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: '5px 10px',
                              borderRadius: '6px',
                            }}
                          >
                            <Ban size={12} />
                            <span>Ban User</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="users-mobile-cards">
        {displayedUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No merchant users match your search criteria.
          </div>
        ) : (
          displayedUsers.map((u) => {
            const banInfo = bannedMap[u.id];
            const isUserBanned = banInfo?.banned || u.isBanned;
            const registrationSource = getRegistrationSource(u.id);
            const sourceStyle = getRegistrationSourceStyle(registrationSource);

            return (
              <div key={u.id} className="user-mobile-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      {u.displayName || 'No Name'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-word', marginTop: '2px' }}>
                      {u.email || 'No Email'}
                    </div>
                  </div>
                  {isUserBanned ? (
                    <span className="badge badge-failed"><ShieldAlert size={12} /> Banned</span>
                  ) : u.emailVerified ? (
                    <span className="badge badge-active"><UserCheck size={12} /> Verified</span>
                  ) : (
                    <span className="badge badge-free">Unverified</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: sourceStyle.color,
                      background: sourceStyle.background,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {getRegistrationSourceLabel(registrationSource)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                    {u.businessName || 'Independent'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '3px 8px' }}>
                    {u.phone || 'No phone'}
                  </span>
                </div>

                <div className="user-mobile-card-actions">
                  <button
                    onClick={() => setSelectedUserForProfile(u)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--accent-blue)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '8px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    <User size={12} />
                    View Profile
                  </button>
                  {isUserBanned ? (
                    <button
                      onClick={() => handleUnban(u.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10B981',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '8px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      Unban
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedUserForBan(u)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: '#F87171',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '8px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      <Ban size={12} />
                      Ban User
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Controls: Pagination Navigation or Scroll Summary */}
      {viewMode === 'paginated' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          {/* Items range description & Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Showing <strong style={{ color: 'var(--text-main)' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong> to{' '}
              <strong style={{ color: 'var(--text-main)' }}>{endIndex}</strong> of{' '}
              <strong style={{ color: 'var(--text-main)' }}>{totalItems}</strong> merchants
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {/* Page Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* First Page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: currentPage <= 1 ? 0.4 : 1,
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
              title="First Page"
            >
              <ChevronsLeft size={16} />
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: currentPage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: currentPage <= 1 ? 0.4 : 1,
                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page Numbers */}
            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((pageNumber, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && pageNumber - prev > 1;

                return (
                  <React.Fragment key={pageNumber}>
                    {showEllipsis && (
                      <span style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>…</span>
                    )}
                    <button
                      onClick={() => setCurrentPage(pageNumber)}
                      style={{
                        minWidth: '32px',
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: pageNumber === currentPage ? 'none' : '1px solid var(--border-color)',
                        background: pageNumber === currentPage ? 'var(--accent-blue)' : 'var(--bg-main)',
                        color: pageNumber === currentPage ? '#FFFFFF' : 'var(--text-main)',
                        fontWeight: pageNumber === currentPage ? 700 : 500,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {pageNumber}
                    </button>
                  </React.Fragment>
                );
              })}

            {/* Next Page */}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: currentPage >= totalPages ? 0.4 : 1,
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: currentPage >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
                opacity: currentPage >= totalPages ? 0.4 : 1,
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
              title="Last Page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>
            Displaying all <strong style={{ color: 'var(--text-main)' }}>{totalItems}</strong> merchant accounts in scroll view.
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
            <Scroll size={13} /> Continuous vertical scroll enabled
          </span>
        </div>
      )}

      {/* USER PROFILE DETAILS MODAL */}
      {selectedUserForProfile && (() => {
        const u = selectedUserForProfile;
        const banInfo = bannedMap[u.id];
        const isUserBanned = banInfo?.banned || u.isBanned;
        const banReasonText = banInfo?.reason || u.banReason || 'Account suspended by admin';

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              className="glass-card admin-modal-card"
              style={{
                width: '100%',
                maxWidth: '560px',
                padding: '24px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              }}
            >
              {/* Profile Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      fontSize: '1.2rem',
                    }}
                  >
                    {(u.displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', wordBreak: 'break-word' }}>
                      {u.displayName || 'Merchant User'}
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                      User ID: #{u.id} • Source:{' '}
                      <span style={{ color: getRegistrationSourceStyle(getRegistrationSource(u.id)).color, fontWeight: 600 }}>
                        {getRegistrationSourceLabel(getRegistrationSource(u.id))}
                      </span>{' '}
                      • UID: <code style={{ color: 'var(--accent-blue)' }}>{u.uid}</code>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedUserForProfile(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Profile Details Grid */}
              <div className="profile-details-grid" style={{ marginBottom: '20px' }}>
                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} /> Email Address
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {u.email || 'N/A'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Phone size={12} /> Contact Phone
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {u.phone || 'N/A'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Building2 size={12} /> Business / Store
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {u.businessName || 'Independent Merchant'}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} /> Account Role &amp; Onboarding
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {u.role || 'Admin'} ({u.onboardingCompleted ? 'Onboarded' : 'Pending'})
                  </div>
                </div>

                <div style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> Last Updated
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {(u.lastUpdatedAt || u.lastLoginAt)
                      ? new Date(u.lastUpdatedAt || u.lastLoginAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'N/A'}
                  </div>
                </div>

                <div className="span-2" style={{ background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} /> Registered / Joined Date
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Status & Ban Reason */}
              <div style={{ padding: '14px', borderRadius: '10px', background: isUserBanned ? 'rgba(244, 63, 94, 0.08)' : 'rgba(16, 185, 129, 0.08)', border: `1px solid ${isUserBanned ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`, marginBottom: '12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isUserBanned ? '#F87171' : '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isUserBanned ? <ShieldAlert size={16} /> : <UserCheck size={16} />}
                  Account Status: {isUserBanned ? 'BANNED / SUSPENDED' : 'ACTIVE & VERIFIED'}
                </div>
                {isUserBanned && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#F87171' }}>
                    Reason: {banReasonText}
                  </p>
                )}
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', background: isSeznikUser(u) ? 'rgba(37,99,235,0.08)' : 'var(--bg-main)', border: `1px solid ${isSeznikUser(u) ? 'rgba(37,99,235,0.3)' : 'var(--border-color)'}`, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isSeznikUser(u) ? '#2563EB' : 'var(--text-muted)' }}>
                    Seznik User Flag
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {isSeznikUser(u) ? 'This merchant is marked as a Seznik user' : 'Not marked as a Seznik user'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleSeznik(u)}
                  disabled={seznikBusyId === u.id}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSeznikUser(u) ? '#64748B' : '#2563EB',
                    color: '#fff',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: seznikBusyId === u.id ? 'wait' : 'pointer',
                  }}
                >
                  {seznikBusyId === u.id ? 'Updating…' : isSeznikUser(u) ? 'Mark Non-Seznik' : 'Mark Seznik'}
                </button>
              </div>

              {/* Profile Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSelectedUserForProfile(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Close Profile
                </button>

                {isUserBanned ? (
                  <button
                    onClick={() => {
                      handleUnban(u.id);
                      setSelectedUserForProfile(null);
                    }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#10B981', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Unban Account
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedUserForProfile(null);
                      setSelectedUserForBan(u);
                    }}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#EF4444', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Ban User Account
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* BAN USER POPUP MODAL */}
      {selectedUserForBan && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="glass-card admin-modal-card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              background: 'var(--bg-card)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ban size={20} color="#F87171" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Ban User Account
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    User ID: #{selectedUserForBan.id} • {selectedUserForBan.displayName}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedUserForBan(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Are you sure you want to suspend <strong style={{ color: 'var(--text-main)' }}>{selectedUserForBan.email}</strong>? Please select a reason for auditing purposes:
            </p>

            {/* Select Reason */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {predefinedReasons.map((reason) => (
                <label
                  key={reason}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: selectedReason === reason ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-main)',
                    border: `1px solid ${selectedReason === reason ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: 'var(--text-main)',
                  }}
                >
                  <input
                    type="radio"
                    name="banReason"
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    style={{ accentColor: 'var(--accent-blue)' }}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {/* Custom Reason Textarea if selected */}
            {selectedReason === 'Custom Reason' && (
              <div style={{ marginBottom: '16px' }}>
                <textarea
                  placeholder="Enter custom ban reason or admin note..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Action Error Alert */}
            {actionError && (
              <div style={{ marginBottom: '16px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#EF4444', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={14} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedUserForBan(null)}
                disabled={actionLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  opacity: actionLoading ? 0.6 : 1,
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmBan}
                disabled={actionLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                  opacity: actionLoading ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {actionLoading && <RefreshCw size={12} className="animate-spin" />}
                {actionLoading ? 'Banning User...' : 'Confirm & Ban Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
