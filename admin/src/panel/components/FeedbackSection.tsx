import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FeedbackView } from './FeedbackView';
import { fetchFeedbackRecords } from '../services/api';
import type { FeedbackRecord } from '../types/admin';

export const FeedbackSection: React.FC = () => {
  const [items, setItems] = useState<FeedbackRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFeedback = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchFeedbackRecords({ page: 1, limit: 500 });
      setItems(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Database connection error or failed request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
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
            onClick={() => loadFeedback()}
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

      {loading && items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="pulse-dot" style={{ width: '16px', height: '16px' }} />
          <span style={{ marginLeft: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading reviews...</span>
        </div>
      ) : (
        <FeedbackView items={items} total={total} onRefresh={loadFeedback} />
      )}
    </div>
  );
};
