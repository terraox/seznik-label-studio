export type ShopCategory = 'labels' | 'printers';

export type AmazonLinkKind = 'product' | 'short_link' | 'unusual_domain' | 'invalid';

export type ShopLinkAudit = {
  kind: AmazonLinkKind;
  host: string | null;
  asin: string | null;
  flags: string[];
  openable: boolean;
};

export type ShopProduct = {
  id: string;
  name: string;
  imageUrl: string;
  amazonUrl: string;
  storeUrl?: string;
  type: string;
  imageSource: string;
  category: ShopCategory;
  sizeLabel: string | null;
  quantityLabel: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number | null;
  detailLabel: string;
  linkAudit: ShopLinkAudit;
};

export type ShopCatalogFlag = {
  id: string;
  name: string;
  kind: string;
  detail?: string;
};

export type ShopCatalog = {
  generatedAt: string;
  source: string;
  labels: ShopProduct[];
  printers: ShopProduct[];
  flags: ShopCatalogFlag[];
};
