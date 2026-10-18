export interface UserRecord {
  id: string | number;
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  businessName: string | null;
  businessType?: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  role: string;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
  lastLoginAt: string;
  lastUpdatedAt?: string;
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;
  seznikUser?: boolean;
  /** Purchased printer product name (e.g. SEZNIK Tejas) */
  printerName?: string | null;
  /** Purchased printer id: tejas | rudra | josh */
  printerId?: string | null;
}

export interface UserLoginLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  device?: string;
  browser?: string;
  loginAt: string;
  status: 'success' | 'failed' | 'active';
  actionType?: 'login' | 'module_access' | 'billing' | 'export' | 'security_flag';
  actionDetails?: string;
}

export interface SectionUsage {
  id: string;
  sectionName: string;
  path: string;
  /** Backend API route prefix, e.g. /api/products */
  apiRoute?: string;
  iconName: string;
  viewCount: number;
  uniqueUsers: number;
  avgDurationMinutes?: number;
  percentageShare: number;
  trend: 'up' | 'down' | 'neutral';
  trendPercent: number;
}

export interface BusinessProfileSummary {
  businessType: string;
  label: string;
  userCount: number;
  totalApiCalls: number;
  totalApiCallsTrend: number;
  topFeature: {
    id: string;
    sectionName: string;
    apiRoute?: string;
    viewCount: number;
  } | null;
}

export interface SectionsSummary {
  totalApiCalls: number;
  totalApiCallsTrend: number;
  activeUserCount: number;
  avgApiCallsPerUser: number;
  mostUsedApi: {
    id: string;
    sectionName: string;
    apiRoute?: string;
    viewCount: number;
    percentageShare: number;
  } | null;
  seznikUserCount: number;
  nonSeznikUserCount: number;
  timeRange: string;
}

export interface DashboardMetrics {
  totalUsers: number;
  totalUsersTrend: number;
  invoicesTodayCount?: number;
  invoicesTodayTrend?: number;
  mobileInvoicesCount?: number;
  webInvoicesCount?: number;
  mobileInvoicesPercent?: number;
  webInvoicesPercent?: number;
  mobileRevenue?: number;
  webRevenue?: number;
  totalMobileInvoices?: number;
  totalWebInvoices?: number;
  totalSalesCount?: number;
  totalRevenue?: number;
  activeInvoicingUsersToday?: number;
  activeInvoicingUsersTrend?: number;
  activeNowCount?: number;
  activeNowTrend?: number;
  loginsTodayCount?: number;
  loginsTodayTrend?: number;
  topSection: string;
  topSectionShare: number;
  topSectionTrend: number;
  verifiedUserPercentage: number;
  freePlanCount?: number;
  proPlanCount?: number;
  enterprisePlanCount?: number;
  totalApiCalls?: number;
  totalApiCallsPrev?: number;
  totalApiCallsTrend?: number;
  timeRange?: string;
  timeWindowLabel?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  platform: 'mobile' | 'web';
  grandTotal: number;
  subtotal: number;
  totalTax: number;
  totalDiscount: number;
  paymentMethod: string;
  isQuickBill: boolean;
  createdAt: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  customerName?: string;
  customerPhone?: string;
}

export interface HeatmapCell {
  /** ISO calendar date (YYYY-MM-DD) in IST — primary row key */
  date?: string;
  /** Short weekday label (Mon, Tue, …) */
  day: string;
  hour: number;
  count: number;
  uniqueUsers?: number;
}

export interface HeatmapResponse {
  cells: HeatmapCell[];
  requestsToday: number;
  requestsThisHour: number;
  requestsThisWeek: number;
  totalAllTime: number;
  currentWeekRange: string;
  /** Present when hour buckets are already Asia/Kolkata wall-clock hours. */
  hoursTimezone?: 'IST' | 'UTC';
}

export interface DeviceSessionBreakdownData {
  desktopCount: number;
  desktopPercent: number;
  mobileCount: number;
  mobilePercent: number;
  totalInvoices?: number;
}

export interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  categoryName: string;
  createdAt: string;
}

export interface HealthDatabaseStatus {
  status: 'connected' | 'disconnected';
  latencyMs?: number;
  error?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptimeSeconds?: number;
  database?: HealthDatabaseStatus;
  environment?: string;
  memoryUsageMb?: number;
  port?: number;
  serverLatencyMs?: number;
  error?: string;
}

export interface FeedbackRecord {
  id: string;
  area: string;
  rating: number | null;
  message: string;
  platform: string;
  productId: string;
  productName: string;
  createdAt: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  businessName: string | null;
}

export interface FeedbackListResponse {
  items: FeedbackRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RedeemedUserDetails {
  id?: string | null;
  email?: string | null;
  displayName?: string | null;
  businessName?: string | null;
  phone?: string | null;
  businessType?: string | null;
  usedAt?: string | null;
}

export interface AccessCodeRecord {
  id: string;
  code: string;
  batchId: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  customerName: string | null;
  customerId: string | null;
  invoiceNumber: string | null;
  phone: string | null;
  printer: string | null;
  isUsed?: boolean;
  usedAt?: string | null;
  usedByUserId?: string | null;
  customerEmail?: string | null;
  redeemedUser?: RedeemedUserDetails | null;
}

export interface AccessCodeLookupResult {
  found: boolean;
  code: string;
  status: 'redeemed' | 'available' | 'not_found';
  isRedeemed: boolean;
  record: AccessCodeRecord | null;
  message?: string;
}

export interface AccessCodeBatch {
  batchId: string;
  count: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AccessCodeListResponse {
  items: AccessCodeRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AccessCodeBatchListResponse {
  items: AccessCodeBatch[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AccessCodeGenerateResponse {
  batchId: string;
  count: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  codes: AccessCodeRecord[];
}

export interface AccessCodeIssuerStat {
  createdBy: string;
  count: number;
  lastGeneratedAt: string;
}

export interface AccessCodeIssuerListResponse {
  items: AccessCodeIssuerStat[];
  totalCodes: number;
}

export interface SupportAgentRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  username: string;
  isDisabled: boolean;
  createdBy: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportAgentListResponse {
  items: SupportAgentRecord[];
}

export interface SupportAgentCreateResponse {
  agent: SupportAgentRecord;
  password: string;
}

export interface PrinterSummaryItem {
  printerName: string;
  totalConnections: number;
  uniqueUsersCount: number;
  webCount: number;
  mobileCount: number;
  firstSeenAt: string | null;
  lastConnectedAt: string | null;
}

export interface PrinterSummaryMetrics {
  totalConnections: number;
  uniquePrinters: number;
  uniqueUsers: number;
  webConnections: number;
  mobileConnections: number;
  topPrinter: string | null;
  topPrinterConnections: number;
  timeRange: string;
}

export interface PrinterSummaryResponse {
  metrics: PrinterSummaryMetrics;
  printers: PrinterSummaryItem[];
}

export interface PrinterUserLogRecord {
  id: string;
  userId: string;
  userName: string;
  businessName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  businessType: string;
  userPlan: string;
  printerName: string;
  deviceAddress: string | null;
  platform: 'web' | 'mobile' | string;
  connectionType: string;
  createdAt: string;
}

export interface PrinterUserLogsResponse {
  logs: PrinterUserLogRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}


