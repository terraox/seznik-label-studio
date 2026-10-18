import type { 
  UserRecord, 
  SectionUsage, 
  DashboardMetrics,
  HeatmapCell,
  HeatmapResponse,
  DeviceSessionBreakdownData,
  InvoiceRecord,
  AdminProduct,
  HealthCheckResult,
  FeedbackListResponse,
  BusinessProfileSummary,
  AccessCodeListResponse,
  AccessCodeBatchListResponse,
  AccessCodeGenerateResponse,
  AccessCodeRecord,
  AccessCodeLookupResult,
  AccessCodeIssuerListResponse,
  SectionsSummary,
  SupportAgentListResponse,
  SupportAgentCreateResponse,
  SupportAgentRecord,
  PrinterSummaryResponse,
  PrinterUserLogsResponse,
} from '../types/admin';

function isLocalDev(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  );
}

function usesSameOriginAdminApi(): boolean {
  if (typeof window === 'undefined') return true;
  if (isLocalDev()) return true;
  // Vercel is HTTPS; talking to an HTTP EC2 IP would be mixed content.
  return window.location.protocol === 'https:';
}

export function getAdminApiBase(): string {
  if (usesSameOriginAdminApi()) return '/api/admin';

  const envUrl = (
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:3000/api'
  )
    .trim()
    .replace(/\/$/, '');
  return envUrl.endsWith('/admin') ? envUrl : `${envUrl}/admin`;
}

function notifyUnauthorized(status: number) {
  if (status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('admin-auth-required'));
  }
}

async function fetchAdminEndpoint<T>(path: string): Promise<T> {
  const url = `${getAdminApiBase()}${path}`;
  const res = await fetch(url, { credentials: 'include' });
  if (res.ok) return (await res.json()) as T;
  notifyUnauthorized(res.status);
  const errData = await res.json().catch(() => null);
  throw new Error(errData?.error || `Server error (${res.status}) on ${path}`);
}

async function postAdminEndpoint<T>(path: string, body?: unknown): Promise<T> {
  const url = `${getAdminApiBase()}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    notifyUnauthorized(response.status);
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Request failed (HTTP ${response.status})`);
  }

  return (await response.json()) as T;
}

async function deleteAdminEndpoint<T>(path: string): Promise<T> {
  const url = `${getAdminApiBase()}${path}`;
  const response = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    notifyUnauthorized(response.status);
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || `Request failed (HTTP ${response.status})`);
  }

  return (await response.json()) as T;
}

export async function fetchDashboardMetrics(timeRange: string = 'all'): Promise<DashboardMetrics> {
  const data = await fetchAdminEndpoint<any>(`/metrics?timeRange=${encodeURIComponent(timeRange)}`);
  return {
    totalUsers: data.totalUsers ?? 0,
    totalUsersTrend: data.totalUsersTrend ?? 0,
    invoicesTodayCount: data.invoicesTodayCount ?? 0,
    invoicesTodayTrend: data.invoicesTodayTrend ?? 0,
    activeInvoicingUsersToday: data.activeInvoicingUsersToday ?? 0,
    activeInvoicingUsersTrend: data.activeInvoicingUsersTrend ?? 0,
    topSection: data.topSection || 'N/A (0%)',
    topSectionShare: data.topSectionShare ?? 0,
    topSectionTrend: data.topSectionTrend ?? 0,
    verifiedUserPercentage: data.verifiedUserPercentage ?? 0,
    timeRange: data.timeRange || timeRange,
    timeWindowLabel: data.timeWindowLabel,
    webInvoicesCount: data.webInvoicesCount,
    mobileInvoicesCount: data.mobileInvoicesCount,
    webInvoicesPercent: data.webInvoicesPercent,
    mobileInvoicesPercent: data.mobileInvoicesPercent,
    mobileRevenue: data.mobileRevenue,
    webRevenue: data.webRevenue,
    totalMobileInvoices: data.totalMobileInvoices,
    totalWebInvoices: data.totalWebInvoices,
    totalSalesCount: data.totalSalesCount,
    totalRevenue: data.totalRevenue,
    totalApiCalls: data.totalApiCalls ?? 0,
    totalApiCallsPrev: data.totalApiCallsPrev ?? 0,
    totalApiCallsTrend: data.totalApiCallsTrend ?? 0,
  };
}

export async function fetchUserRecords(timeRange: string = 'all'): Promise<UserRecord[]> {
  return await fetchAdminEndpoint<UserRecord[]>(`/users?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchSectionUsage(timeRange: string = 'all'): Promise<SectionUsage[]> {
  return await fetchAdminEndpoint<SectionUsage[]>(`/sections?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchSectionsSummary(timeRange: string = 'all'): Promise<SectionsSummary> {
  return await fetchAdminEndpoint<SectionsSummary>(`/sections/summary?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchBusinessProfiles(timeRange: string = 'all'): Promise<BusinessProfileSummary[]> {
  return await fetchAdminEndpoint<BusinessProfileSummary[]>(`/profiles?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchProfileSectionUsage(
  businessType: string,
  timeRange: string = 'all'
): Promise<SectionUsage[]> {
  return await fetchAdminEndpoint<SectionUsage[]>(
    `/profiles/${encodeURIComponent(businessType)}/sections?timeRange=${encodeURIComponent(timeRange)}`
  );
}

const IST_TZ = 'Asia/Kolkata';

function istDateHourFromUtcBucket(dateKey: string, hour: number) {
  const utc = new Date(Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hour,
    30,
    0,
  ));
  const date = utc.toLocaleDateString('en-CA', { timeZone: IST_TZ });
  const hourPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utc).find((part) => part.type === 'hour')?.value;
  return { date, hour: Number(hourPart) % 24 };
}

/** Older heatmap APIs bucketed by UTC hour while the grid is labeled IST. */
function normalizeHeatmapToIst(data: HeatmapResponse): HeatmapResponse {
  if (data.hoursTimezone === 'IST') return data;

  const merged = new Map<string, HeatmapCell>();
  for (const cell of data.cells || []) {
    const dateKey = cell.date;
    const srcHour = Number(cell.hour);
    const ist = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? istDateHourFromUtcBucket(dateKey, srcHour)
      : { date: dateKey || cell.day, hour: srcHour };
    const key = `${ist.date}|${ist.hour}`;
    const prev = merged.get(key);
    merged.set(key, {
      date: ist.date,
      day: cell.day,
      hour: ist.hour,
      count: (prev?.count || 0) + (cell.count || 0),
      uniqueUsers: Math.max(prev?.uniqueUsers || 0, cell.uniqueUsers || 0),
    });
  }

  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: IST_TZ });
  return {
    ...data,
    cells: Array.from(merged.values()).filter((cell) => !cell.date || cell.date <= todayIst),
    hoursTimezone: 'IST',
  };
}

export async function fetchHeatmapData(timeRange: string = 'all', days?: number): Promise<HeatmapResponse> {
  const daysQuery = days != null && days > 0 ? `&days=${days}` : '';
  const res = await fetchAdminEndpoint<any>(`/heatmap?timeRange=${encodeURIComponent(timeRange)}${daysQuery}`);
  if (Array.isArray(res)) {
    const total = res.reduce((sum: number, c: HeatmapCell) => sum + (c.count || 0), 0);
    return normalizeHeatmapToIst({
      cells: res,
      requestsToday: 0,
      requestsThisHour: 0,
      requestsThisWeek: total,
      totalAllTime: total,
      currentWeekRange: 'Current Week',
    });
  }
  return normalizeHeatmapToIst(res);
}

export async function fetchDeviceSessionBreakdown(timeRange: string = 'all'): Promise<DeviceSessionBreakdownData> {
  return await fetchAdminEndpoint<DeviceSessionBreakdownData>(`/devices?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchProducts(limit: number = 100): Promise<AdminProduct[]> {
  return await fetchAdminEndpoint<AdminProduct[]>(`/products?limit=${limit}`);
}

export async function fetchInvoices(timeRange: string = 'all', platform: string = 'all', limit: number = 100): Promise<InvoiceRecord[]> {
  return await fetchAdminEndpoint<InvoiceRecord[]>(`/invoices?timeRange=${encodeURIComponent(timeRange)}&platform=${encodeURIComponent(platform)}&limit=${limit}`);
}

export async function banUser(userId: string | number, reason: string): Promise<any> {
  return postAdminEndpoint(`/users/${encodeURIComponent(String(userId))}/ban`, { reason });
}

export async function unbanUser(userId: string | number): Promise<any> {
  return postAdminEndpoint(`/users/${encodeURIComponent(String(userId))}/unban`);
}

export async function setSeznikUser(userId: string | number, seznikUser: boolean): Promise<any> {
  return postAdminEndpoint(`/users/${encodeURIComponent(String(userId))}/seznik`, { seznikUser });
}

function getBackendHealthUrl(): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return '/api/pos-health';
  }
  const apiUrl = (
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:3000/api'
  )
    .trim()
    .replace(/\/$/, '');
  const base = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
  return `${base}/health`;
}

async function fetchHealthEndpoint(url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'include' });
    clearTimeout(timeoutId);
    const data = (await res.json().catch(() => ({}))) as HealthCheckResult;
    if (res.status === 401) notifyUnauthorized(401);
    return {
      ...data,
      status: data.status || (res.ok ? 'healthy' : 'unhealthy'),
      timestamp: data.timestamp || new Date().toISOString(),
      serverLatencyMs: Date.now() - start,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      serverLatencyMs: Date.now() - start,
      error: err?.name === 'AbortError' ? 'Request timed out after 8s' : (err?.message || 'Server unreachable'),
      database: { status: 'disconnected', error: 'Could not reach server' },
    };
  }
}

export async function fetchAdminHealth(): Promise<HealthCheckResult> {
  return fetchHealthEndpoint(`${getAdminApiBase()}/health`);
}

export async function fetchBackendHealth(): Promise<HealthCheckResult> {
  return fetchHealthEndpoint(getBackendHealthUrl());
}

export async function fetchFeedbackRecords(params: {
  page?: number;
  limit?: number;
  platform?: string;
  productId?: string;
  search?: string;
} = {}): Promise<FeedbackListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.platform && params.platform !== 'all') searchParams.set('platform', params.platform);
  if (params.productId) searchParams.set('productId', params.productId);
  if (params.search) searchParams.set('search', params.search);
  const qs = searchParams.toString();
  return fetchAdminEndpoint<FeedbackListResponse>(`/feedback${qs ? `?${qs}` : ''}`);
}

export async function generateAccessCodes(count: number, shipmentName: string): Promise<AccessCodeGenerateResponse> {
  return postAdminEndpoint<AccessCodeGenerateResponse>('/access-codes/generate', {
    count,
    note: shipmentName.trim(),
  });
}

export async function fetchAccessCodes(params: {
  page?: number;
  limit?: number;
  batchId?: string;
  search?: string;
  createdBy?: string;
  customerOnly?: boolean;
} = {}): Promise<AccessCodeListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.batchId) searchParams.set('batchId', params.batchId);
  if (params.search) searchParams.set('search', params.search);
  if (params.createdBy) searchParams.set('createdBy', params.createdBy);
  if (params.customerOnly) searchParams.set('customerOnly', '1');
  const qs = searchParams.toString();
  return fetchAdminEndpoint<AccessCodeListResponse>(`/access-codes${qs ? `?${qs}` : ''}`);
}

export async function lookupAdminAccessCode(code: string): Promise<AccessCodeLookupResult> {
  return fetchAdminEndpoint<AccessCodeLookupResult>(`/access-codes/search?code=${encodeURIComponent(code.trim())}`);
}

export async function fetchAccessCodeIssuers(): Promise<AccessCodeIssuerListResponse> {
  return fetchAdminEndpoint<AccessCodeIssuerListResponse>('/access-codes/issuers');
}

export async function fetchAccessCodeBatches(params: {
  page?: number;
  limit?: number;
} = {}): Promise<AccessCodeBatchListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return fetchAdminEndpoint<AccessCodeBatchListResponse>(`/access-codes/batches${qs ? `?${qs}` : ''}`);
}

export async function fetchAccessCodesByBatch(batchId: string): Promise<{
  batchId: string;
  count: number;
  codes: AccessCodeRecord[];
}> {
  return fetchAdminEndpoint(`/access-codes/batch/${encodeURIComponent(batchId)}`);
}

export async function fetchSupportAgents(): Promise<SupportAgentListResponse> {
  return fetchAdminEndpoint<SupportAgentListResponse>('/support-agents');
}

export async function createSupportAgent(payload: {
  name: string;
  phone: string;
  email: string;
  username: string;
  password: string;
}): Promise<SupportAgentCreateResponse> {
  return postAdminEndpoint<SupportAgentCreateResponse>('/support-agents', payload);
}

export async function disableSupportAgent(id: string): Promise<{ success: boolean; agent: SupportAgentRecord }> {
  return postAdminEndpoint(`/support-agents/${encodeURIComponent(id)}/disable`);
}

export async function enableSupportAgent(id: string): Promise<{ success: boolean; agent: SupportAgentRecord }> {
  return postAdminEndpoint(`/support-agents/${encodeURIComponent(id)}/enable`);
}

export async function resetSupportAgentPassword(
  id: string
): Promise<{ success: boolean; agent: SupportAgentRecord; password: string }> {
  return postAdminEndpoint(`/support-agents/${encodeURIComponent(id)}/reset-password`);
}

export async function revokeSupportAgent(id: string): Promise<{ success: boolean; id: string }> {
  return deleteAdminEndpoint(`/support-agents/${encodeURIComponent(id)}`);
}

function getSupportApiBase(): string {
  if (usesSameOriginAdminApi()) return '/api/support';
  const envUrl = (
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
    'http://localhost:3000/api'
  )
    .trim()
    .replace(/\/$/, '');
  return envUrl.endsWith('/support') ? envUrl : `${envUrl.replace(/\/admin$/, '')}/support`;
}

function notifySupportUnauthorized(status: number) {
  if ((status === 401 || status === 403) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('support-auth-required'));
  }
}

async function parseSupportError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return (data as { error?: string } | null)?.error || fallback;
}

export async function fetchSupportSession(): Promise<{ agent: SupportAgentRecord }> {
  const res = await fetch(`${getSupportApiBase()}/me`, { credentials: 'include' });
  if (!res.ok) {
    notifySupportUnauthorized(res.status);
    throw new Error(await parseSupportError(res, 'Not signed in'));
  }
  return (await res.json()) as { agent: SupportAgentRecord };
}

export async function loginSupport(
  username: string,
  password: string
): Promise<{ success: boolean; agent: SupportAgentRecord }> {
  const res = await fetch(`${getSupportApiBase()}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await parseSupportError(res, 'Invalid username or password'));
  return (await res.json()) as { success: boolean; agent: SupportAgentRecord };
}

export async function logoutSupport(): Promise<void> {
  await fetch(`${getSupportApiBase()}/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function issueSupportAccessCode(payload: {
  customerName: string;
  customerId: string;
  invoiceNumber: string;
  phone: string;
  printer: string;
}): Promise<{ success: boolean; record: AccessCodeRecord }> {
  const res = await fetch(`${getSupportApiBase()}/access-codes/issue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    notifySupportUnauthorized(res.status);
    throw new Error(await parseSupportError(res, 'Failed to issue code'));
  }
  return (await res.json()) as { success: boolean; record: AccessCodeRecord };
}

export async function fetchSupportAccessCodes(params: {
  page?: number;
  limit?: number;
  search?: string;
} = {}): Promise<AccessCodeListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);
  const qs = searchParams.toString();
  const res = await fetch(`${getSupportApiBase()}/access-codes${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    notifySupportUnauthorized(res.status);
    throw new Error(await parseSupportError(res, 'Failed to load codes'));
  }
  return (await res.json()) as AccessCodeListResponse;
}

export async function lookupSupportAccessCode(code: string): Promise<AccessCodeLookupResult> {
  const res = await fetch(`${getSupportApiBase()}/access-codes/search?code=${encodeURIComponent(code.trim())}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    notifySupportUnauthorized(res.status);
    throw new Error(await parseSupportError(res, 'Failed to search access code'));
  }
  return (await res.json()) as AccessCodeLookupResult;
}

export type PrinterCatalogItem = {
  id: string;
  printerName: string;
  shortName: string;
  bridge: string;
  tagline: string;
};

export async function fetchPrinterCatalog(): Promise<{ printers: PrinterCatalogItem[] }> {
  return fetchAdminEndpoint<{ printers: PrinterCatalogItem[] }>('/printers/catalog');
}

export async function fetchPrinterSummary(timeRange: string = 'all'): Promise<PrinterSummaryResponse> {
  return fetchAdminEndpoint<PrinterSummaryResponse>(`/printers/summary?timeRange=${encodeURIComponent(timeRange)}`);
}

export async function fetchPrinterUserLogs(params: {
  search?: string;
  platform?: string;
  printerName?: string;
  timeRange?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PrinterUserLogsResponse> {
  const sp = new URLSearchParams();
  if (params.search) sp.set('search', params.search);
  if (params.platform) sp.set('platform', params.platform);
  if (params.printerName) sp.set('printerName', params.printerName);
  if (params.timeRange) sp.set('timeRange', params.timeRange);
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  return fetchAdminEndpoint<PrinterUserLogsResponse>(`/printers/user-logs${qs ? `?${qs}` : ''}`);
}


