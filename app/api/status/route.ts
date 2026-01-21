import { NextResponse } from 'next/server';
import { getOutageStatus } from '@/src/monitors/outage';

export async function GET() {
  try {
    const status = getOutageStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
