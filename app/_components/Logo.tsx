/** The brand logo (public/logo.webp, 160×30). The alt text keeps the brand name for screen readers. */
export function Logo({ height = 30 }: { height?: number }) {
  const brand = process.env.BRAND_NAME ?? 'Tracking';
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.webp" alt={brand} width={Math.round((160 * height) / 30)} height={height} className="brand-logo" />;
}
