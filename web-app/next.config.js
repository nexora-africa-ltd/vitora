const { execSync } = require('child_process');

// Get build ID at config load time so it's available for env vars
let BUILD_ID;
try {
  BUILD_ID = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  BUILD_ID = `build-${Date.now()}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Expose build info as environment variables for version checking
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
    BUILD_ID: BUILD_ID,
    BUILD_TIME: new Date().toISOString(),
  },

  // Generate a consistent build ID based on git commit hash
  // This helps with cache invalidation when deploying new versions
  generateBuildId: async () => BUILD_ID,

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

  // Set cache headers for static assets
  // Hashed files (_next/static) can be cached forever
  // Other assets should revalidate
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // HTML pages should revalidate
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "nexora-consulting-limited",
  project: "web-app",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
