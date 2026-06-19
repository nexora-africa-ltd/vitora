/**
 * Next.js API Route: /api/local-db/query
 *
 * Provides local SQLite query access for desktop mode.
 * Only available when VITORA_DESKTOP=1 (Tauri sidecar).
 *
 * POST body: { table, where?, orderBy?, limit?, offset?, search?, searchColumns? }
 * Returns: { data: [...], count: number }
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
    const { table, where, orderBy, limit, offset, search, searchColumns } = body;

    if (!table) {
      return NextResponse.json({ error: 'table is required' }, { status: 400 });
    }

    // Dynamic import to avoid loading native modules in web mode
    const { queryLocal, countLocal, searchLocal } = await import('@/lib/desktop/data-access');

    let data: unknown[];
    let count: number;

    if (search && searchColumns?.length) {
      data = searchLocal(table, searchColumns, search, { limit, orderBy });
      count = data.length;
    } else {
      data = queryLocal({ table, where, orderBy, limit, offset });
      count = countLocal(table, where);
    }

    return NextResponse.json({ data, count });
  } catch (error) {
    console.error('[LocalDB API] Query error:', error);
    return NextResponse.json(
      { error: 'Query failed', details: String(error) },
      { status: 500 }
    );
  }
}
