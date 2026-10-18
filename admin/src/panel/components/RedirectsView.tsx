import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Layers,
  Scroll,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';
import { SEZNIK_WEBSITE_PRODUCTS } from '../data/seznikWebsiteProducts';
import type { RedirectTimeFrame } from '../types/redirect';

type SortKey = 'name' | 'sku' | 'category' | 'redirects';
type SortDir = 'asc' | 'desc';
type ActivityFilter = 'all' | 'with' | 'none';
type ViewMode = 'paginated' | 'scroll';

interface ProductRedirectItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  productUrl: string;
  redirects: Record<RedirectTimeFrame, number>;
}

const TIMEFRAMES: { id: RedirectTimeFrame; label: string; hint: string }[] = [
  { id: 'today', label: 'Today', hint: 'From 12:00 AM today' },
  { id: '7d', label: '7 Days', hint: 'Last 7 days' },
  { id: '15d', label: '15 Days', hint: 'Last 15 days' },
  { id: '30d', label: '30 Days', hint: 'Last 30 days' },
  { id: 'all', label: 'All Time', hint: 'Entire history' },
];

const SORT_FIELDS: { key: SortKey; label: string }[] = [
  { key: 'redirects', label: 'Redirects' },
  { key: 'name', label: 'Product name' },
  { key: 'sku', label: 'SKU' },
  { key: 'category', label: 'Category' },
];

const sortMeaning = (key: SortKey, dir: SortDir) => {
  const isAsc = dir === 'asc';
  if (key === 'redirects') {
    return {
      word: isAsc ? 'Ascending' : 'Descending',
      hint: isAsc ? 'Low → High' : 'High → Low',
    };
  }
  return {
    word: isAsc ? 'Ascending' : 'Descending',
    hint: isAsc ? 'A → Z' : 'Z → A',
  };
};

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

export const RedirectsView: React.FC = () => {
  const [timeFrame, setTimeFrame] = useState<RedirectTimeFrame>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('redirects');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('paginated');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const categories = useMemo(() => {
    return [...new Set(SEZNIK_WEBSITE_PRODUCTS.map((p) => p.categoryName))].sort((a, b) =>
      a.localeCompare(b)
    );
  }, []);

  const redirectItems: ProductRedirectItem[] = useMemo(() => {
    return SEZNIK_WEBSITE_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku || 'N/A',
      category: p.categoryName || 'General',
      productUrl: p.productUrl,
      redirects: {
        today: 0,
        '7d': 0,
        '15d': 0,
        '30d': 0,
        all: 0,
      },
    }));
  }, []);

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const result = redirectItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      const count = item.redirects[timeFrame] || 0;
      const matchesActivity =
        activityFilter === 'all' ||
        (activityFilter === 'with' && count > 0) ||
        (activityFilter === 'none' && count === 0);

      return matchesSearch && matchesCategory && matchesActivity;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'redirects') {
        cmp = (a.redirects[timeFrame] || 0) - (b.redirects[timeFrame] || 0);
      } else if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'sku') {
        cmp = a.sku.localeCompare(b.sku);
      } else {
        cmp = a.category.localeCompare(b.category);
      }
      if (sortDir === 'desc') cmp = -cmp;
      if (cmp === 0 && sortKey !== 'name') cmp = a.name.localeCompare(b.name);
      return cmp;
    });

    return result;
  }, [redirectItems, searchQuery, categoryFilter, activityFilter, timeFrame, sortKey, sortDir]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, activityFilter, sortKey, sortDir, pageSize, timeFrame, viewMode]);

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const displayedItems =
    viewMode === 'paginated' ? filteredData.slice(startIndex, endIndex) : filteredData;

  const totalRedirects = useMemo(
    () => filteredData.reduce((sum, item) => sum + (item.redirects[timeFrame] || 0), 0),
    [filteredData, timeFrame]
  );

  const selectedTimeframe = TIMEFRAMES.find((tf) => tf.id === timeFrame);
  const hasActiveFilters =
    searchQuery.trim().length > 0 || categoryFilter !== 'all' || activityFilter !== 'all';

  const currentSort = sortMeaning(sortKey, sortDir);
  const sortFieldLabel = SORT_FIELDS.find((field) => field.key === sortKey)?.label ?? 'Redirects';

  const handleSortHeader = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'redirects' ? 'desc' : 'asc');
  };

  const sortableTh = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const isActive = sortKey === key;
    const meaning = sortMeaning(key, isActive ? sortDir : 'asc');
    const nextMeaning = sortMeaning(
      key,
      isActive ? (sortDir === 'asc' ? 'desc' : 'asc') : key === 'redirects' ? 'desc' : 'asc'
    );

    return (
      <th style={{ textAlign: align }}>
        <button
          type="button"
          onClick={() => handleSortHeader(key)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
            gap: '6px',
            width: '100%',
            background: 'none',
            border: 'none',
            padding: 0,
            color: isActive ? 'var(--accent-blue)' : 'inherit',
            font: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            fontWeight: isActive ? 700 : 600,
            cursor: 'pointer',
          }}
          title={
            isActive
              ? `Currently ${meaning.word.toLowerCase()} (${meaning.hint}). Click to switch to ${nextMeaning.word.toLowerCase()} (${nextMeaning.hint}).`
              : `Sort by ${label}`
          }
        >
          <span>{label}</span>
          {isActive ? (
            <span className="redirects-sort-chip" style={{ textTransform: 'none' }}>
              {sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              {meaning.word} · {meaning.hint}
            </span>
          ) : (
            <ArrowUpDown size={12} style={{ opacity: 0.45 }} />
          )}
        </button>
      </th>
    );
  };

  const renderTableRows = () => {
    if (displayedItems.length === 0) {
      return (
        <tr>
          <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            {hasActiveFilters
              ? 'No product redirects match your search or filters.'
              : 'No product redirects found.'}
          </td>
        </tr>
      );
    }

    return displayedItems.map((item) => (
      <tr key={item.id}>
        <td style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.86rem', maxWidth: '520px' }}>
          <a
            href={item.productUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'inherit',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{item.name}</span>
            <ExternalLink size={12} color="var(--text-muted)" />
          </a>
        </td>
        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku}</td>
        <td>
          <span className="badge badge-pro" style={{ fontSize: '0.72rem' }}>
            {item.category}
          </span>
        </td>
        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-blue)', fontSize: '0.95rem' }}>
          {item.redirects[timeFrame].toLocaleString()}
        </td>
      </tr>
    ));
  };

  return (
    <div className="redirects-page">
      <div className="redirects-demo-banner">
        <strong style={{ color: '#F59E0B' }}>Demo data:</strong> Redirect counts are not tracked in the database yet.
        Product names are the full catalog from{' '}
        <a href="https://seznik.in/collections/all" target="_blank" rel="noreferrer" style={{ color: '#F59E0B' }}>
          seznik.in
        </a>{' '}
        ({SEZNIK_WEBSITE_PRODUCTS.length} products). Redirect numbers are placeholders until analytics are wired up.
      </div>

      <div className="glass-card redirects-products-card" style={{ padding: '16px 20px' }}>
        <div className="redirects-header">
          <div className="page-header-row" style={{ alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Website Redirects
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {SEZNIK_WEBSITE_PRODUCTS.length} products from the seznik.in catalog. {selectedTimeframe?.hint}.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '6px' }}>Products:</span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--accent-blue)', fontWeight: 700 }}>
                  {filteredData.length.toLocaleString()}
                </strong>
              </div>
              <div
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '6px' }}>
                  Total Redirects:
                </span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--accent-blue)', fontWeight: 700 }}>
                  {totalRedirects.toLocaleString()}
                </strong>
              </div>

              <div
                className="timeframe-pills"
                style={{ background: 'var(--tab-bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--tab-border)' }}
              >
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => setTimeFrame(tf.id)}
                    title={tf.hint}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: timeFrame === tf.id ? 'var(--accent-blue)' : 'transparent',
                      color: timeFrame === tf.id ? '#FFFFFF' : 'var(--text-muted)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="redirects-toolbar">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            <div className="redirects-control-group">
              <span className="redirects-control-label">View</span>
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
                  type="button"
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
                  title="Paginated view"
                >
                  <Layers size={14} />
                  Paginated
                </button>
                <button
                  type="button"
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
                  title="Scroll view"
                >
                  <Scroll size={14} />
                  Scroll View
                </button>
              </div>
            </div>

            <div className="redirects-control-group">
              <span className="redirects-control-label">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={controlStyle}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="redirects-control-group">
              <span className="redirects-control-label">Activity</span>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
                style={controlStyle}
                aria-label="Filter by redirect activity"
              >
                <option value="all">All Products</option>
                <option value="with">With redirects</option>
                <option value="none">No redirects</option>
              </select>
            </div>

            <div className="redirects-control-group">
              <span className="redirects-control-label">Sort by</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={controlStyle}
                aria-label="Sort by"
              >
                {SORT_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="redirects-control-group">
              <span className="redirects-control-label">Order</span>
              <div className="redirects-order-toggle" role="group" aria-label="Sort order">
                {(['asc', 'desc'] as const).map((dir) => {
                  const meaning = sortMeaning(sortKey, dir);
                  const isActive = sortDir === dir;
                  return (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setSortDir(dir)}
                      title={`${meaning.word} (${meaning.hint})`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: isActive ? 'var(--accent-blue)' : 'transparent',
                        color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                      <span style={{ fontWeight: isActive ? 700 : 600, fontSize: '0.78rem', lineHeight: 1.2 }}>
                        {meaning.word}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 500,
                          opacity: isActive ? 0.9 : 0.75,
                          lineHeight: 1.2,
                        }}
                      >
                        {meaning.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="redirects-control-group">
            <span className="redirects-control-label">Search</span>
            <div className="redirects-search">
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search product name, SKU, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '-4px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Sorted by <strong style={{ color: 'var(--text-main)' }}>{sortFieldLabel}</strong>
            {' · '}
            {currentSort.word} ({currentSort.hint})
            {hasActiveFilters
              ? ` · Showing ${totalItems.toLocaleString()} of ${redirectItems.length.toLocaleString()} products`
              : ''}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
                setActivityFilter('all');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--accent-blue)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="redirects-table-wrap">
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                {sortableTh('name', 'Product Name')}
                {sortableTh('sku', 'SKU')}
                {sortableTh('category', 'Category')}
                {sortableTh('redirects', 'Number of Redirects', 'right')}
              </tr>
            </thead>
            <tbody>{renderTableRows()}</tbody>
          </table>
        </div>

        {viewMode === 'paginated' ? (
          <div
            className="redirects-footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingTop: '4px',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Showing <strong style={{ color: 'var(--text-main)' }}>{totalItems === 0 ? 0 : startIndex + 1}</strong>{' '}
                to <strong style={{ color: 'var(--text-main)' }}>{endIndex}</strong> of{' '}
                <strong style={{ color: 'var(--text-main)' }}>{totalItems}</strong> products
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1} style={pageBtnStyle(currentPage <= 1)} title="First page">
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
        ) : (
          <div
            className="redirects-footer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '4px',
              borderTop: '1px solid var(--border-color)',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Displaying all <strong style={{ color: 'var(--text-main)' }}>{totalItems}</strong> products in scroll view.
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--accent-blue)' }}>
              <Scroll size={13} /> Continuous vertical scroll enabled
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
