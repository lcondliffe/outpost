import { NextResponse } from 'next/server';
import { listServers } from '@/src/monitors/speedtest';

export async function GET() {
  try {
    return NextResponse.json({ servers: await listServers() });
  } catch (error) {
    console.error('Error listing speedtest servers:', error);
    return NextResponse.json({ error: 'Failed to list speedtest servers' }, { status: 500 });
  }
}
