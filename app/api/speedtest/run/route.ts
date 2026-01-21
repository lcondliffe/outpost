import { NextResponse } from 'next/server';
import { triggerSpeedtest } from '@/src/monitors/speedtest';

export async function POST() {
  try {
    const jobId = triggerSpeedtest();
    return NextResponse.json({ status: 'started', id: jobId });
  } catch (error) {
    console.error('Error triggering speedtest:', error);
    return NextResponse.json({ error: 'Failed to trigger speedtest' }, { status: 500 });
  }
}
