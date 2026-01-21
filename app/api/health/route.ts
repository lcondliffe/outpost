import { NextResponse } from 'next/server';

const startTime = Date.now();
const VERSION = '1.0.0';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: VERSION,
    uptime: Math.round((Date.now() - startTime) / 1000),
    timestamp: Date.now(),
  });
}
