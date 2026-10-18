import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  fetchAccessCodeBatches,
  fetchAccessCodes,
  fetchAccessCodesByBatch,
  generateAccessCodes,
  lookupAdminAccessCode,
} from '../services/api';
import type { AccessCodeBatch, AccessCodeRecord } from '../types/admin';
import { CodeSearchModal } from './CodeSearchModal';
import {
  exportAccessCodesCsv,
  exportAccessCodesExcel,
  exportAccessCodesPdf,
} from '../utils/exportAccessCodes';

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
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-main)',
  color: 'var(--text-main)',
  fontSize: '0.74rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

function formatWhen(iso: string) {
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

export const AccessCodesView: React.FC = () => {
  const [countInput, setCountInput] = useState('50');
  const [noteInput, setNoteInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [batches, setBatches] = useState<AccessCodeBatch[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [totalCodes, setTotalCodes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [exportBusyId, setExportBusyId] = useState<string | null>(null);

  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedCodes, setExpandedCodes] = useState<AccessCodeRecord[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [selectedSearchCode, setSelectedSearchCode] = useState('');

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const [batchRes, codesRes] = await Promise.all([
        fetchAccessCodeBatches({ page: 1, limit: 100 }),
        fetchAccessCodes({ page: 1, limit: 1 }),
      ]);
      setBatches(batchRes.items);
      setBatchTotal(batchRes.total);
      setTotalCodes(codesRes.total);
    } catch (err: any) {
      setListError(err?.message || 'Failed to load generations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const parsedCount = useMemo(() => {
    const n = Math.floor(Number(countInput));
    return Number.isFinite(n) ? n : NaN;
  }, [countInput]);

  const countValid = parsedCount >= 1 && parsedCount <= 5000;
  const shipmentName = noteInput.trim();
  const shipmentValid = shipmentName.length > 0;
  const formValid = countValid && shipmentValid;

  const handleGenerate = async () => {
    if (!countValid) {
      setGenerateError('Enter a number between 1 and 5,000');
      return;
    }
    if (!shipmentValid) {
      setGenerateError('Shipment name is required');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setSuccessMessage(null);
    try {
      const result = await generateAccessCodes(parsedCount, shipmentName);
      setSuccessMessage(`Generated ${result.count} unique codes for “${shipmentName}”`);
      setNoteInput('');
      setExpandedBatchId(result.batchId);
      setExpandedCodes(result.codes);
      await loadBatches();
    } catch (err: any) {
      setGenerateError(err?.message || 'Failed to generate codes');
    } finally {
      setGenerating(false);
    }
  };

  const loadBatchCodes = async (batchId: string) => {
    setLoadingDetails(true);
    try {
      const res = await fetchAccessCodesByBatch(batchId);
      setExpandedCodes(res.codes);
      return res.codes;
    } catch (err: any) {
      setListError(err?.message || 'Failed to load batch details');
      return [] as AccessCodeRecord[];
    } finally {
      setLoadingDetails(false);
    }
  };

  const toggleDetails = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setExpandedCodes([]);
      return;
    }
    setExpandedBatchId(batchId);
    await loadBatchCodes(batchId);
  };

  const runExport = async (kind: 'csv' | 'excel' | 'pdf', batchId: string) => {
    setExportBusyId(batchId);
    setListError(null);
    try {
      let codes = expandedBatchId === batchId && expandedCodes.length > 0
        ? expandedCodes
        : null;
      if (!codes) {
        codes = await loadBatchCodes(batchId);
      }
      if (!codes.length) throw new Error('No codes found for this generation');

      const prefix = `access-codes_${batchId.slice(0, 8)}`;
      if (kind === 'csv') exportAccessCodesCsv(codes, prefix);
      else if (kind === 'excel') exportAccessCodesExcel(codes, prefix);
      else exportAccessCodesPdf(codes);
    } catch (err: any) {
      setListError(err?.message || 'Export failed');
    } finally {
      setExportBusyId(null);
    }
  };

  return (
    <div className="admin-page-stack access-codes-page">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: '12px',
          alignItems: 'stretch',
        }}
        className="access-codes-top-row"
      >
      {/* Generate */}
      <section
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '18px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <KeyRound size={18} color="var(--accent-blue)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Generate Access Codes
              </h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Unique 7-character alphanumeric codes (A–Z, 0–9). Never reused.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedSearchCode('');
              setSearchModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 13px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-main)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Search size={14} color="var(--accent-blue)" />
            Search Code
          </button>
        </div>

        <div
          className="access-codes-form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 1fr auto',
            gap: '10px',
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Number of codes
            </span>
            <input
              type="number"
              min={1}
              max={5000}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              style={controlStyle}
              placeholder="e.g. 100"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Shipment name <span style={{ color: '#EF4444' }}>*</span>
            </span>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              style={controlStyle}
              placeholder="e.g. March partner pack"
              maxLength={200}
              required
            />
          </label>

          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || !formValid}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              height: '40px',
              padding: '0 18px',
              borderRadius: '10px',
              border: 'none',
              background: generating || !formValid ? '#93C5FD' : 'var(--accent-blue)',
              color: '#fff',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: generating || !formValid ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {generateError && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={15} />
            {generateError}
          </div>
        )}

        {successMessage && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.28)',
              color: 'var(--text-main)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={15} color="#10B981" />
            {successMessage}
          </div>
        )}
      </section>

      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          minWidth: '160px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Total codes
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.12)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Hash size={14} color="#10B981" />
          </div>
        </div>
        <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          {totalCodes.toLocaleString()}
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Generated all time
        </span>
      </div>
      </div>

      {/* Generations history */}
      <section
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '14px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Generations</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {batchTotal} generation{batchTotal === 1 ? '' : 's'} · view details or export again
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setSelectedSearchCode('');
                setSearchModalOpen(true);
              }}
              style={exportBtnStyle}
              title="Search and verify any code status"
            >
              <Search size={13} color="var(--accent-blue)" />
              Search Code
            </button>
            <button
              type="button"
              onClick={() => void loadBatches()}
              style={exportBtnStyle}
              title="Refresh"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </div>

        {listError && (
          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: '0.8rem',
            }}
          >
            {listError}
          </div>
        )}

        <div
          style={{
            overflow: 'auto',
            flex: 1,
            minHeight: 0,
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ width: 36, padding: '10px 8px', borderBottom: '1px solid var(--border-color)' }} />
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>Generated</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>Codes</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>Shipment name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>By</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>Export</th>
              </tr>
            </thead>
            <tbody>
              {loading && batches.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={16} className="spin" style={{ display: 'inline', marginRight: 8 }} />
                    Loading generations…
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No generations yet. Create your first batch above.
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const isOpen = expandedBatchId === batch.batchId;
                  const busy = exportBusyId === batch.batchId;
                  return (
                    <React.Fragment key={batch.batchId}>
                      <tr
                        style={{
                          borderBottom: isOpen ? 'none' : '1px solid var(--border-color)',
                          background: isOpen ? 'rgba(37, 99, 235, 0.04)' : undefined,
                        }}
                      >
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => void toggleDetails(batch.batchId)}
                            title={isOpen ? 'Hide details' : 'View details'}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              display: 'inline-flex',
                              padding: 4,
                            }}
                          >
                            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => void toggleDetails(batch.batchId)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              cursor: 'pointer',
                              color: 'var(--text-main)',
                              fontWeight: 600,
                              fontSize: '0.8rem',
                            }}
                          >
                            {formatWhen(batch.createdAt)}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                          {batch.count}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                          {batch.note || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                          {batch.createdBy || '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              style={exportBtnStyle}
                              disabled={busy}
                              onClick={() => void runExport('csv', batch.batchId)}
                            >
                              <Download size={12} /> CSV
                            </button>
                            <button
                              type="button"
                              style={exportBtnStyle}
                              disabled={busy}
                              onClick={() => void runExport('excel', batch.batchId)}
                            >
                              <FileSpreadsheet size={12} /> Excel
                            </button>
                            <button
                              type="button"
                              style={exportBtnStyle}
                              disabled={busy}
                              onClick={() => void runExport('pdf', batch.batchId)}
                            >
                              <FileText size={12} /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr style={{ background: 'rgba(37, 99, 235, 0.03)' }}>
                          <td colSpan={6} style={{ padding: '0 12px 14px', borderBottom: '1px solid var(--border-color)' }}>
                            <div
                              style={{
                                marginTop: 4,
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '10px',
                                  marginBottom: '10px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                  Batch <span style={{ fontFamily: 'ui-monospace, monospace' }}>{batch.batchId.slice(0, 8)}</span>
                                  {' · '}
                                  {batch.count} code{batch.count === 1 ? '' : 's'}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    style={exportBtnStyle}
                                    disabled={busy || loadingDetails}
                                    onClick={() => void runExport('pdf', batch.batchId)}
                                  >
                                    <FileText size={12} /> Print / PDF
                                  </button>
                                  <button
                                    type="button"
                                    style={exportBtnStyle}
                                    disabled={busy || loadingDetails}
                                    onClick={() => void runExport('excel', batch.batchId)}
                                  >
                                    <FileSpreadsheet size={12} /> Excel
                                  </button>
                                </div>
                              </div>

                              {loadingDetails && expandedCodes.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                  <Loader2 size={14} className="spin" style={{ display: 'inline', marginRight: 6 }} />
                                  Loading codes…
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))',
                                    gap: '8px',
                                    maxHeight: '260px',
                                    overflowY: 'auto',
                                  }}
                                >
                                  {expandedCodes.map((code) => {
                                    const isRedeemed = Boolean(code.isUsed || code.customerName || code.usedByUserId);
                                    return (
                                      <div
                                        key={code.id}
                                        onClick={() => {
                                          setSelectedSearchCode(code.code);
                                          setSearchModalOpen(true);
                                        }}
                                        title={`Code ${code.code} · ${isRedeemed ? 'Redeemed' : 'Available'} · Click to view full details`}
                                        style={{
                                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                          letterSpacing: '0.06em',
                                          fontWeight: 700,
                                          fontSize: '0.82rem',
                                          padding: '8px 10px',
                                          borderRadius: '8px',
                                          border: `1px solid ${isRedeemed ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-color)'}`,
                                          background: isRedeemed ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-main)',
                                          color: isRedeemed ? '#059669' : 'var(--text-main)',
                                          textAlign: 'center',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 2,
                                          cursor: 'pointer',
                                          transition: 'transform 0.1s, box-shadow 0.1s',
                                        }}
                                      >
                                        <span>{code.code}</span>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 600, opacity: 0.85 }}>
                                          {isRedeemed ? '✓ Redeemed' : 'Available'}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CodeSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchFn={lookupAdminAccessCode}
        initialCode={selectedSearchCode}
        title="Search Access Code"
      />
    </div>
  );
};
