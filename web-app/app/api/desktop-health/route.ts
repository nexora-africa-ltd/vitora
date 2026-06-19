export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, service: 'vitora-desktop', timestamp: new Date().toISOString() });
}
