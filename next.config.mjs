/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['mysql2'],
  experimental: {
    // Creative uploads (banners up to 2 MB) go through server actions.
    serverActions: { bodySizeLimit: '3mb' },
  },
};

export default nextConfig;
