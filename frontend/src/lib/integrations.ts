// Tools RunOut connects to. Shown in the logo strip, the integrations marquee and the footer.
// Only list real integrations. `slug` is the icon name on simpleicons.org; `inset` shrinks wide wordmarks in the tiles.
export const INTEGRATIONS = [
  { name: "Shopify", slug: "shopify" },
  { name: "WooCommerce", slug: "woocommerce", inset: "14%" },
  { name: "BigCommerce", slug: "bigcommerce" },
  { name: "Etsy", slug: "etsy" },
  { name: "Square", slug: "square" },
  { name: "QuickBooks", slug: "quickbooks" },
  { name: "Xero", slug: "xero" },
  { name: "Google Sheets", slug: "googlesheets" },
  { name: "UPS", slug: "ups" },
  { name: "USPS", slug: "usps" },
];

/** Simple Icons CDN URL; pass a colour (e.g. "white") for a single-colour icon. */
export const iconUrl = (slug: string, color?: string) => `https://cdn.simpleicons.org/${slug}${color ? `/${color}` : ""}`;
