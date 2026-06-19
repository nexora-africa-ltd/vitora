import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VITORA_DESKTOP !== '1') {
    return NextResponse.json(
      { error: 'Desktop startup status is only available in desktop mode' },
      { status: 404 }
    );
  }

  const { getDesktopStartupStatus } = await import('@/lib/desktop/startup-services');
  return NextResponse.json(getDesktopStartupStatus());
}
