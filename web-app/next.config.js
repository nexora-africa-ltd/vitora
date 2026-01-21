/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Route aliases: /billing/* → /transactions/*
  // Allows cleaner URLs while keeping existing folder structure
  async rewrites() {
    return [
      {
        source: '/billing',
        destination: '/transactions',
      },
      {
        source: '/billing/:path*',
        destination: '/transactions/:path*',
      },
    ];
  },
}

module.exports = nextConfig
