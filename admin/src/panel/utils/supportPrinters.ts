import { SEZNIK_WEBSITE_PRODUCTS } from '../data/seznikWebsiteProducts';

const PRINTER_CATEGORY_RE = /printer/i;

/** Printer products from the Seznik catalog for support issuance dropdowns. */
export function getSupportPrinterOptions(): Array<{ value: string; label: string; sku: string }> {
  return SEZNIK_WEBSITE_PRODUCTS.filter((p) => PRINTER_CATEGORY_RE.test(p.categoryName))
    .map((p) => {
      const label = p.name.length > 90 ? `${p.name.slice(0, 87)}…` : p.name;
      return { value: p.name, label: `${label} (${p.sku})`, sku: p.sku };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
