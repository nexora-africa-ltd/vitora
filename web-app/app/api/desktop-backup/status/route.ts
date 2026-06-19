import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Desktop backups are only available in desktop mode' },
      { status: 404 }
    );
  }

  try {
    const { getBackupStatus } = await import('@/lib/desktop/backup-service');
    return NextResponse.json(getBackupStatus());
  } catch (error) {
    return NextResponse.json(
      { error: 'Backup status failed', details: String(error) },
      { status: 500 }
    );
  }
}
