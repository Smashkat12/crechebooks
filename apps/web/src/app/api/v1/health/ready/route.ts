import { NextResponse } from 'next/server';

// Mirrors the API's /api/v1/health/ready so the shared root railway.toml
// healthcheck path works for the web service too. Without this, every web
// deploy fails healthcheck and Railway sticks on the previous container —
// which is exactly what stranded staging on a 2-day-old image and stopped
// our recent pushes from going live.
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'crechebooks-web',
    },
    { status: 200 },
  );
}
