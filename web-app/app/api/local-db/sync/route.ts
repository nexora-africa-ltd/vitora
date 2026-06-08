/**
 * Next.js API Route: /api/local-db/sync
 *
 * Triggers sync operations and returns status.
 * Only available when VITORA_DESKTOP=1 (Tauri sidecar).
 *
 * GET  → returns sync status
 * POST → triggers a sync cycle (push + pull)
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Local DB only available in desktop mode' },
      { status: 404 }
    );
  }

  try {
    const { getSyncStatus } = await import('@/lib/desktop/sync-engine');
    return NextResponse.json(getSyncStatus());
  } catch (error) {
    return NextResponse.json(
      { error: 'Status check failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Local DB only available in desktop mode' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { full } = body as { full?: boolean };

    const { runSyncCycle, pullChanges } = await import('@/lib/desktop/sync-engine');

    if (full) {
      // Full re-sync
      const pulled = await pullChanges(true);
      return NextResponse.json({ pulled, pushed: 0, full: true });
    }

    const result = await runSyncCycle();
    return NextResponse.json(result || { pushed: 0, pulled: 0 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
