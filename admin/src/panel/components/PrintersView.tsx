import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bluetooth,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  HardDrive,
  Hash,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  fetchPrinterCatalog,
  fetchPrinterSummary,
  fetchPrinterUserLogs,
  type PrinterCatalogItem,
} from '../services/api';
import type {
  PrinterSummaryItem,
  PrinterSummaryMetrics,
  PrinterUserLogRecord,
} from '../types/admin';
import {
  exportPrinterFrequencyCsv,
  exportPrinterFrequencyExcel,
  exportPrinterUserLogsCsv,
  exportPrinterUserLogsExcel,
} from '../utils/exportPrinters';

const controlStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.84rem',
  outline: 'none',
};

const exportBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}

export const PrintersView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'frequency' | 'userLogs'>('frequency');
  const [timeRange, setTimeRange] = useState('all');

  // Product catalog (printer names sold with the app)
  const [catalog, setCatalog] = useState<PrinterCatalogItem[]>([]);

  // Summary state (View 1)
  const [summaryMetrics, setSummaryMetrics] = useState<PrinterSummaryMetrics | null>(null);
  const [summaryList, setSummaryList] = useState<PrinterSummaryItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [frequencySearch, setFrequencySearch] = useState('');

  // User Logs state (View 2)
  const [logsList, setLogsList] = useState<PrinterUserLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsPlatform, setLogsPlatform] = useState('all');
  const [selectedPrinterFilter, setSelectedPrinterFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Load Summary
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const [res, catalogRes] = await Promise.all([
        fetchPrinterSummary(timeRange).catch((err: Error) => {
          throw err;
        }),
        fetchPrinterCatalog().catch(() => ({ printers: [] as PrinterCatalogItem[] })),
      ]);
      setSummaryMetrics(res.metrics);
      setSummaryList(res.printers || []);
      setCatalog(catalogRes.printers || []);
    } catch (err) {
      console.error('Failed to load printer summary:', err);
      setSummaryError(err instanceof Error ? err.message : 'Failed to load printer summary');
      // Catalog can still load when analytics is not implemented yet
      fetchPrinterCatalog()
        .then((catalogRes) => setCatalog(catalogRes.printers || []))
        .catch(() => setCatalog([]));
    } finally {
      setSummaryLoading(false);
    }
  }, [timeRange]);

  // Load User Logs
  const loadUserLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetchPrinterUserLogs({
        search: logsSearch,
        platform: logsPlatform,
        printerName: selectedPrinterFilter,
        timeRange,
        page: currentPage,
        limit: pageSize,
      });
      setLogsList(res.logs || []);
      setTotalLogsCount(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      console.error('Failed to load user printer logs:', err);
      setLogsError(err instanceof Error ? err.message : 'Failed to load printer logs');
    } finally {
      setLogsLoading(false);
    }
  }, [logsSearch, logsPlatform, selectedPrinterFilter, timeRange, currentPage, pageSize]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (activeTab === 'userLogs') {
      loadUserLogs();
    }
  }, [activeTab, loadUserLogs]);

  // Filtered summary list by search input
  const filteredSummaryList = useMemo(() => {
    if (!frequencySearch.trim()) return summaryList;
    const q = frequencySearch.trim().toLowerCase();
    return summaryList.filter((item) => item.printerName.toLowerCase().includes(q));
  }, [summaryList, frequencySearch]);

  const handleDrilldownPrinter = (printerName: string) => {
    setSelectedPrinterFilter(printerName);
    setActiveTab('userLogs');
    setCurrentPage(1);
  };

  const handleExportAllLogs = async (type: 'csv' | 'excel') => {
    try {
      const res = await fetchPrinterUserLogs({
        search: logsSearch,
        platform: logsPlatform,
        printerName: selectedPrinterFilter,
        timeRange,
        page: 1,
        limit: 5000,
      });
      if (type === 'csv') {
        exportPrinterUserLogsCsv(res.logs || []);
      } else {
        exportPrinterUserLogsExcel(res.logs || []);
      }
    } catch (e) {
      alert('Failed to export logs');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '100%' }}>
      {/* Top Header Card */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '20px 24px',
          background: 'var(--card-bg)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
          >
            <Printer size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Printer Analytics & Device Logs
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Live tracking of Bluetooth printer connections from Web POS and Mobile App
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Time range select */}
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(e.target.value);
              setCurrentPage(1);
            }}
            style={{ ...controlStyle, fontWeight: 500 }}
          >
            <option value="all">All Time</option>
            <option value="today">Today (IST)</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>

          <button
            onClick={() => {
              loadSummary();
              if (activeTab === 'userLogs') loadUserLogs();
            }}
            style={exportBtnStyle}
            title="Refresh data"
          >
            <RefreshCw size={14} className={summaryLoading || logsLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Printer product names (purchased models) */}
      {catalog.length > 0 ? (
        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <HardDrive size={16} color="var(--accent-blue)" />
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Printer names
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Models customers select after register
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            {catalog.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                  {p.printerName}
                </div>
                <div style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {p.tagline}
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--accent-blue)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Bridge · {p.bridge}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Connections
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {summaryMetrics?.totalConnections?.toLocaleString() ?? '0'}
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={12} color="#3b82f6" /> Web: {summaryMetrics?.webConnections ?? 0}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Smartphone size={12} color="#10b981" /> Mobile: {summaryMetrics?.mobileConnections ?? 0}
            </span>
          </div>
        </div>

        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unique Printer Models
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
              <Bluetooth size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {summaryMetrics?.uniquePrinters?.toLocaleString() ?? '0'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Distinct raw Bluetooth device names logged
          </div>
        </div>

        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connected Users
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {summaryMetrics?.uniqueUsers?.toLocaleString() ?? '0'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Stores & accounts paired with printers
          </div>
        </div>

        <div
          style={{
            padding: '18px 20px',
            background: 'var(--card-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Top Device
            </span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
              <HardDrive size={16} />
            </div>
          </div>
          <div
            style={{
              fontSize: '1.15rem',
              fontWeight: 800,
              color: 'var(--text-main)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={summaryMetrics?.topPrinter || 'None'}
          >
            {summaryMetrics?.topPrinter || 'None'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            {summaryMetrics?.topPrinterConnections ? `${summaryMetrics.topPrinterConnections} connection sessions` : 'No logs recorded yet'}
          </div>
        </div>
      </div>

      {/* View Switcher Tabs & Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '12px',
        }}
      >
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('frequency')}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'frequency' ? 'var(--primary-color, #3b82f6)' : 'transparent',
              color: activeTab === 'frequency' ? '#ffffff' : 'var(--text-muted)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <TrendingUp size={15} />
            Printer Name & Frequency
            <span
              style={{
                fontSize: '0.72rem',
                padding: '2px 7px',
                borderRadius: '10px',
                background: activeTab === 'frequency' ? 'rgba(255,255,255,0.25)' : 'var(--bg-main)',
                color: activeTab === 'frequency' ? '#ffffff' : 'var(--text-main)',
              }}
            >
              {summaryList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('userLogs')}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'userLogs' ? 'var(--primary-color, #3b82f6)' : 'transparent',
              color: activeTab === 'userLogs' ? '#ffffff' : 'var(--text-muted)',
              fontSize: '0.86rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Users size={15} />
            User Name & Printer Name
            {selectedPrinterFilter && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: 'rgba(239,68,68,0.2)',
                  color: '#ef4444',
                }}
              >
                Filtered
              </span>
            )}
          </button>
        </div>

        {/* Action / Export Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'frequency' ? (
            <>
              <button
                onClick={() => exportPrinterFrequencyCsv(filteredSummaryList)}
                style={exportBtnStyle}
                disabled={filteredSummaryList.length === 0}
              >
                <FileText size={14} color="#3b82f6" />
                Export CSV
              </button>
              <button
                onClick={() => exportPrinterFrequencyExcel(filteredSummaryList)}
                style={exportBtnStyle}
                disabled={filteredSummaryList.length === 0}
              >
                <FileSpreadsheet size={14} color="#10b981" />
                Export Excel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleExportAllLogs('csv')}
                style={exportBtnStyle}
                disabled={totalLogsCount === 0}
              >
                <FileText size={14} color="#3b82f6" />
                Export CSV
              </button>
              <button
                onClick={() => handleExportAllLogs('excel')}
                style={exportBtnStyle}
                disabled={totalLogsCount === 0}
              >
                <FileSpreadsheet size={14} color="#10b981" />
                Export Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: Printer Name & Frequency View */}
      {activeTab === 'frequency' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Search bar */}
          <div style={{ display: 'flex', gap: '10px', maxWidth: '400px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search printer name / bluetooth model..."
                value={frequencySearch}
                onChange={(e) => setFrequencySearch(e.target.value)}
                style={{ ...controlStyle, paddingLeft: '36px', width: '100%' }}
              />
            </div>
            {frequencySearch && (
              <button
                onClick={() => setFrequencySearch('')}
                style={{ ...exportBtnStyle, padding: '8px 12px' }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--bg-main)',
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <th style={{ padding: '12px 16px', width: '60px' }}>#</th>
                    <th style={{ padding: '12px 16px' }}>Bluetooth Printer Name (As-Is)</th>
                    <th style={{ padding: '12px 16px' }}>Printer Frequency</th>
                    <th style={{ padding: '12px 16px' }}>Unique Users</th>
                    <th style={{ padding: '12px 16px' }}>Platform Share</th>
                    <th style={{ padding: '12px 16px' }}>Logged At (IST)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryLoading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                          <Loader2 size={24} className="animate-spin" />
                          <span>Loading printer analytics...</span>
                        </div>
                      </td>
                    </tr>
                  ) : summaryError ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#ef4444' }}>
                        {summaryError}
                      </td>
                    </tr>
                  ) : filteredSummaryList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                          <Printer size={32} style={{ opacity: 0.4 }} />
                          <span>No printer connection logs found.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSummaryList.map((item, idx) => {
                      const total = item.totalConnections || 1;
                      const maxTotal = summaryMetrics?.totalConnections || 1;
                      const percentOfMax = Math.min(100, Math.round((item.totalConnections / maxTotal) * 100));

                      return (
                        <tr
                          key={item.printerName}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            transition: 'background 0.1s ease',
                          }}
                        >
                          <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  background: 'rgba(59,130,246,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#3b82f6',
                                  flexShrink: 0,
                                }}
                              >
                                <Bluetooth size={14} />
                              </div>
                              <div>
                                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem' }}>
                                  {item.printerName}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '140px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                                <span>{item.totalConnections.toLocaleString()}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{percentOfMax}%</span>
                              </div>
                              <div
                                style={{
                                  width: '100%',
                                  height: '5px',
                                  borderRadius: '3px',
                                  background: 'var(--border-color)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${percentOfMax}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                                    borderRadius: '3px',
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(16,185,129,0.1)',
                                color: '#10b981',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                              }}
                            >
                              <Users size={12} />
                              {item.uniqueUsersCount} {item.uniqueUsersCount === 1 ? 'user' : 'users'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {item.webCount > 0 && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: 'rgba(59,130,246,0.12)',
                                    color: '#3b82f6',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                  }}
                                  title={`${item.webCount} connections from Web`}
                                >
                                  <Globe size={11} /> Web ({item.webCount})
                                </span>
                              )}
                              {item.mobileCount > 0 && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: 'rgba(16,185,129,0.12)',
                                    color: '#10b981',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                  }}
                                  title={`${item.mobileCount} connections from Mobile`}
                                >
                                  <Smartphone size={11} /> Mobile ({item.mobileCount})
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontWeight: 500, fontSize: '0.78rem' }}>
                            {formatWhen(item.lastConnectedAt)}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDrilldownPrinter(item.printerName)}
                              style={{
                                ...exportBtnStyle,
                                padding: '4px 10px',
                                fontSize: '0.74rem',
                                color: '#3b82f6',
                                borderColor: 'rgba(59,130,246,0.3)',
                              }}
                            >
                              View Logs
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: User Name & Printer Name View */}
      {activeTab === 'userLogs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Active printer filter banner (if drilled down) */}
          {selectedPrinterFilter && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontSize: '0.84rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={15} color="#3b82f6" />
                <span>
                  Showing logs filtered for printer: <strong>{selectedPrinterFilter}</strong>
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedPrinterFilter('');
                  setCurrentPage(1);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                }}
              >
                <X size={14} /> Clear Filter
              </button>
            </div>
          )}

          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
              {/* Search by user, business, phone, email, printer */}
              <div style={{ position: 'relative', minWidth: '280px', flex: 1, maxWidth: '450px' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search user name, business, phone, email, device..."
                  value={logsSearch}
                  onChange={(e) => {
                    setLogsSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ ...controlStyle, paddingLeft: '36px', width: '100%' }}
                />
              </div>

              {/* Platform selector */}
              <select
                value={logsPlatform}
                onChange={(e) => {
                  setLogsPlatform(e.target.value);
                  setCurrentPage(1);
                }}
                style={controlStyle}
              >
                <option value="all">All Platforms</option>
                <option value="web">Web POS Only</option>
                <option value="mobile">Mobile App Only</option>
              </select>
            </div>

            {/* Page size & pagination summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ ...controlStyle, padding: '4px 8px', fontSize: '0.8rem' }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
              <span>entries (Total: {totalLogsCount})</span>
            </div>
          </div>

          {/* Table */}
          <div
            style={{
              background: 'var(--card-bg)',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--bg-main)',
                      borderBottom: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <th style={{ padding: '12px 16px' }}>User & Business Name</th>
                    <th style={{ padding: '12px 16px' }}>Contact</th>
                    <th style={{ padding: '12px 16px' }}>Bluetooth Printer Name (As-Is)</th>
                    <th style={{ padding: '12px 16px' }}>Platform</th>
                    <th style={{ padding: '12px 16px' }}>Device / MAC Address</th>
                    <th style={{ padding: '12px 16px' }}>Logged At (IST)</th>
                  </tr>
                </thead>
                <tbody>
                  {logsLoading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                          <Loader2 size={24} className="animate-spin" />
                          <span>Loading user printer connection logs...</span>
                        </div>
                      </td>
                    </tr>
                  ) : logsError ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#ef4444' }}>
                        {logsError}
                      </td>
                    </tr>
                  ) : logsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                          <Printer size={32} style={{ opacity: 0.4 }} />
                          <span>No matching printer connection records found.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    logsList.map((log) => (
                      <tr
                        key={log.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem' }}>
                              {log.userName}
                            </span>
                            {log.businessName && (
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                {log.businessName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.78rem' }}>
                            {log.userPhone ? (
                              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{log.userPhone}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No phone</span>
                            )}
                            {log.userEmail && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{log.userEmail}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Bluetooth size={14} color="#3b82f6" />
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.88rem' }}>
                              {log.printerName}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {log.platform === 'mobile' ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(16,185,129,0.12)',
                                color: '#10b981',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                              }}
                            >
                              <Smartphone size={12} /> Mobile App
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(59,130,246,0.12)',
                                color: '#3b82f6',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                              }}
                            >
                              <Globe size={12} /> Web POS
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                          {log.deviceAddress || '-'}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontWeight: 500, fontSize: '0.78rem' }}>
                          {formatWhen(log.createdAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--bg-main)',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ color: 'var(--text-muted)' }}>
                  Page {currentPage} of {totalPages}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1 || logsLoading}
                    style={{
                      ...exportBtnStyle,
                      padding: '4px 10px',
                      opacity: currentPage <= 1 ? 0.5 : 1,
                    }}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages || logsLoading}
                    style={{
                      ...exportBtnStyle,
                      padding: '4px 10px',
                      opacity: currentPage >= totalPages ? 0.5 : 1,
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
