/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['pg', '@clickhouse/client'],
};

export default nextConfig;
