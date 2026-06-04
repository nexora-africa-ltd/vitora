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
  output: 'standalone',
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
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
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
        // All other HTML pages should revalidate + enable cross-origin
        // isolation for PowerSync (wa-sqlite SharedArrayBuffer).
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          // Security headers
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // PowerSync (wa-sqlite) requires SharedArrayBuffer,
          // which in turn requires cross-origin isolation headers.
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
            // 'credentialless' is less restrictive than 'require-corp'
            // and still enables SharedArrayBuffer in modern browsers.
            // It allows loading cross-origin images/fonts without CORS.
          },
        ],
      },
      {
        // Analytics page loads the Metabase Embedding SDK (cross-origin
        // script + web components). Relax COEP so the SDK can function.
        // Placed AFTER /:path* so it overrides the default COEP header.
        source: '/analytics',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
      {
        source: '/analytics/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },

  // Webpack config for handling Node.js modules in browser (Cornerstone.js WASM codecs)
  // and WASM support for PowerSync (wa-sqlite)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Provide empty fallbacks for Node.js modules used by Cornerstone.js codecs
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };

      // Enable async WebAssembly for wa-sqlite (used by PowerSync)
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };

      // Exclude wa-sqlite WASM from Next.js default asset handling
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
      });
    }
    return config;
  },

  // Turbopack config for dev mode (handles same issue as webpack fallbacks)
  // These modules are used by @cornerstonejs WASM codecs but only in Node.js environments
  turbopack: {
    resolveAlias: {
      // Provide empty module stubs for Node.js built-ins
      fs: './empty-module.js',
      path: './empty-module.js',
      crypto: './empty-module.js',
    },
  },

  // Allow next/image to load from the Django backend (thumbnails, media)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9088',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: '*.azurecontainerapps.io',
        pathname: '/media/**',
      },
    ],
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
