import { NextResponse } from 'next/server';

const startTime = Date.now();

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.APP_VERSION,
    commit: process.env.GIT_SHA,
    uptime: Math.round((Date.now() - startTime) / 1000),
    timestamp: Date.now(),
  });
}
