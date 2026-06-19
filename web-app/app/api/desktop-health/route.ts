export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VITORA_DESKTOP === '1') {
    setTimeout(() => {
      import('@/lib/desktop/startup-services')
        .then(({ scheduleDesktopServices }) => scheduleDesktopServices('desktop-health'))
        .catch((error) => console.warn('[DesktopStartup] Health-triggered startup failed:', error));
    }, 0);

    return Response.json({
      ok: true,
      service: 'vitora-desktop',
      timestamp: new Date().toISOString(),
    });
  }

  return Response.json({
    ok: true,
    service: 'vitora-desktop',
    timestamp: new Date().toISOString(),
  });
}
