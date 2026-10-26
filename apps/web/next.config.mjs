/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['pg', '@clickhouse/client'],
  },
};

export default nextConfig;
