import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Railway deployment
 * Returns 200 OK to indicate the service is running
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'crechebooks-web',
    },
    { status: 200 }
  );
}
