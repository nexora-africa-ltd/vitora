/**
 * Version API Route
 *
 * Returns the current build ID/version for client-side version checking.
 * This allows the app to detect when a new deployment has occurred.
 */

import { NextResponse } from 'next/server';

// Build ID is set at build time
// In development, we use a timestamp-based version
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || process.env.BUILD_ID || 'development';
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

export async function GET() {
  return NextResponse.json(
    {
      version: BUILD_ID,
      buildId: BUILD_ID,
      buildTime: BUILD_TIME,
      environment: process.env.NODE_ENV,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
