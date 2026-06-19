import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Desktop backups are only available in desktop mode' },
      { status: 404 }
    );
  }

  try {
    const { startDesktopServices } = await import('@/lib/desktop/startup-services');
    await startDesktopServices('backup-now');
    const { createBackup, getBackupStatus } = await import('@/lib/desktop/backup-service');
    const backup = createBackup('rolling');

    if (!backup) {
      return NextResponse.json(
        { error: 'Backup could not be created because the local database is unavailable' },
        { status: 503 }
      );
    }

    return NextResponse.json({ backup, status: getBackupStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: 'Backup creation failed', details: String(error) },
      { status: 500 }
    );
  }
}
