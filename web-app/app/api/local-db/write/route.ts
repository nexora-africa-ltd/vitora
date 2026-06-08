/**
 * Next.js API Route: /api/local-db/write
 *
 * Provides local SQLite write access for desktop mode.
 * Writes to local DB AND queues for server sync.
 * Only available when VITORA_DESKTOP=1 (Tauri sidecar).
 *
 * POST body: { table, operation: 'CREATE'|'UPDATE'|'DELETE', recordId?, data }
 * Returns: { record: {...} }
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Only available in desktop mode
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Local DB only available in desktop mode' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { table, operation, recordId, data } = body;

    if (!table || !operation) {
      return NextResponse.json(
        { error: 'table and operation are required' },
        { status: 400 }
      );
    }

    if (!['CREATE', 'UPDATE', 'DELETE'].includes(operation)) {
      return NextResponse.json(
        { error: 'operation must be CREATE, UPDATE, or DELETE' },
        { status: 400 }
      );
    }

    if ((operation === 'UPDATE' || operation === 'DELETE') && !recordId) {
      return NextResponse.json(
        { error: 'recordId is required for UPDATE and DELETE' },
        { status: 400 }
      );
    }

    // Dynamic import to avoid loading native modules in web mode
    const { writeLocal } = await import('@/lib/desktop/data-access');

    const record = writeLocal({ table, operation, recordId, data: data || {} });

    if (!record) {
      return NextResponse.json(
        { error: 'Write failed — local DB not available' },
        { status: 503 }
      );
    }

    return NextResponse.json({ record }, { status: operation === 'CREATE' ? 201 : 200 });
  } catch (error) {
    console.error('[LocalDB API] Write error:', error);
    return NextResponse.json(
      { error: 'Write failed', details: String(error) },
      { status: 500 }
    );
  }
}
