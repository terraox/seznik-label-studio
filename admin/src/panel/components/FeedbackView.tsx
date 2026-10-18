import React, { useMemo, useState } from 'react';
import {
  Search,
  MessageSquare,
  Phone,
  User,
  Star,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  RefreshCw,
} from 'lucide-react';
import { SEZNIK_WEBSITE_PRODUCTS } from '../data/seznikWebsiteProducts';
import type { FeedbackRecord } from '../types/admin';

type PlatformFilter = 'all' | 'web' | 'mobile' | 'unknown';
type ViewMode = 'paginated' | 'scroll';

const controlStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.8rem',
  outline: 'none',
  cursor: 'pointer',
};

const pageBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-main)',
  color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
  opacity: disabled ? 0.4 : 1,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const CATEGORIES = Array.from(new Set(SEZNIK_WEBSITE_PRODUCTS.map((p) => p.categoryName))).sort();

const PRODUCT_URL_BY_ID = new Map(SEZNIK_WEBSITE_PRODUCTS.map((p) => [p.id, p.productUrl]));

function displayUserName(row: FeedbackRecord): string {
  return row.displayName || row.businessName || row.email || 'Unknown user';
}

function platformLabel(platform: string): string {
  if (platform === 'web') return 'Web';
  if (platform === 'mobile') return 'App';
  return 'Unknown';
}

function platformBadgeStyle(platform: string): React.CSSProperties {
  if (platform === 'web') {
    return { background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.35)' };
  }
  if (platform === 'mobile') {
    return { background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.35)' };
  }
  return { background: 'rgba(148, 163, 184, 0.15)', color: '#94A3B8', border: '1px solid rgba(148, 163, 184, 0.35)' };
}

interface FeedbackViewProps {
  items: FeedbackRecord[];
  total: number;
  onRefresh?: () => void;
}

export const FeedbackView: React.FC<FeedbackViewProps> = ({ items, total, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('paginated');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedItem, setSelectedItem] = useState<FeedbackRecord | null>(null);

  const productCategoryById = useMemo(
    () => new Map(SEZNIK_WEBSITE_PRODUCTS.map((p) => [p.id, p.categoryName])),
    []
  );

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter((row) => {
      if (platformFilter !== 'all' && row.platform !== platformFilter) return false;
      if (categoryFilter !== 'all') {
        const cat = productCategoryById.get(row.productId);
        if (cat !== categoryFilter) return false;
      }
      if (!q) return true;
      const haystack = [
        displayUserName(row),
        row.phone,
        row.email,
        row.message,
        row.productName,
        row.area,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchTerm, platformFilter, categoryFilter, productCategoryById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedRows =
    viewMode === 'paginated'
      ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : filtered;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, platformFilter, categoryFilter, pageSize]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Reviews & Suggestions</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {total} total submission{total === 1 ? '' : 's'} from merchants
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              ...controlStyle,
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search name, phone, product, message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...controlStyle, width: '100%', paddingLeft: '32px', cursor: 'text' }}
          />
        </div>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)} style={controlStyle}>
          <option value="all">All platforms</option>
          <option value="web">Web</option>
          <option value="mobile">App</option>
          <option value="unknown">Unknown (legacy)</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={controlStyle}>
          <option value="all">All product categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} style={controlStyle}>
          <option value="paginated">Paginated</option>
          <option value="scroll">Scroll all</option>
        </select>
        {viewMode === 'paginated' && (
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={controlStyle}>
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="custom-table" style={{ width: '100%', minWidth: '960px' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Product</th>
              <th>Platform</th>
              <th>Rating</th>
              <th>Area</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  No reviews match your filters.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => {
                const productUrl = PRODUCT_URL_BY_ID.get(row.productId);
                return (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{formatDate(row.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                        <User size={14} color="var(--text-muted)" />
                        {displayUserName(row)}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {row.phone ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={13} /> {row.phone}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '220px', fontSize: '0.78rem' }}>
                      {productUrl ? (
                        <a href={productUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', display: 'inline-flex', alignItems: 'flex-start', gap: '4px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {row.productName}
                          </span>
                          <ExternalLink size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                        </a>
                      ) : (
                        row.productName
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          ...platformBadgeStyle(row.platform),
                        }}
                      >
                        {platformLabel(row.platform)}
                      </span>
                    </td>
                    <td>
                      {row.rating ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.78rem' }}>
                          <Star size={13} fill="#FBBF24" color="#FBBF24" /> {row.rating}/5
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem', textTransform: 'capitalize' }}>{row.area.replace(/_/g, ' ')}</td>
                    <td style={{ maxWidth: '260px' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedItem(row)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'var(--text-main)',
                          fontSize: '0.78rem',
                          display: 'inline-flex',
                          alignItems: 'flex-start',
                          gap: '4px',
                        }}
                      >
                        <MessageSquare size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {row.message}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {viewMode === 'paginated' && filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage <= 1}
              style={pageBtnStyle(currentPage <= 1)}
              title="First page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={pageBtnStyle(currentPage <= 1)}
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: totalPages }, (_, idx) => idx + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((pageNumber, idx, arr) => {
                const prev = arr[idx - 1];
                const showEllipsis = prev && pageNumber - prev > 1;
                const isActive = pageNumber === currentPage;

                return (
                  <React.Fragment key={pageNumber}>
                    {showEllipsis && (
                      <span style={{ padding: '0 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>…</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(pageNumber)}
                      style={{
                        minWidth: '32px',
                        height: '32px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: isActive ? 'none' : '1px solid var(--border-color)',
                        background: isActive ? 'var(--accent-blue)' : 'var(--bg-main)',
                        color: isActive ? '#FFFFFF' : 'var(--text-main)',
                        fontWeight: isActive ? 700 : 500,
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

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={pageBtnStyle(currentPage >= totalPages)}
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage >= totalPages}
              style={pageBtnStyle(currentPage >= totalPages)}
              title="Last page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}

      {selectedItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="glass-card"
            style={{ maxWidth: '560px', width: '100%', padding: '24px', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Feedback details</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {formatDate(selectedItem.createdAt)} · {platformLabel(selectedItem.platform)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'grid', gap: '10px', fontSize: '0.84rem' }}>
              <div><strong>Name:</strong> {displayUserName(selectedItem)}</div>
              <div><strong>Phone:</strong> {selectedItem.phone || '—'}</div>
              <div><strong>Product:</strong> {selectedItem.productName}</div>
              <div><strong>Area:</strong> {selectedItem.area}</div>
              {selectedItem.rating && <div><strong>Rating:</strong> {selectedItem.rating}/5</div>}
              <div>
                <strong>Message:</strong>
                <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{selectedItem.message}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
