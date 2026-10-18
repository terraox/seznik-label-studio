export type RedirectTimeFrame = 'today' | '7d' | '15d' | '30d' | 'all'

export interface RedirectClickEvent {
  id: string
  timestamp: string
  source: string
  device: 'Desktop' | 'Mobile'
}

export interface AdminProductRedirect {
  id: string
  productId: string
  productName: string
  productSku: string
  sellingPrice: number
  categoryName: string
  imageURL?: string
  targetUrl: string
  clicks: RedirectClickEvent[]
  totalRedirects: number
  lastRedirectAt?: string
  status: 'active' | 'paused'
  createdAt: string
}

export interface RedirectSummaryMetrics {
  totalRedirects: number
  activeCount: number
  topProduct: {
    name: string
    sku: string
    count: number
  } | null
  growthPercent: number
}

export interface RedirectChartPoint {
  label: string
  count: number
  dateStr?: string
}
