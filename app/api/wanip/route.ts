import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';
import { getConfig } from '@/src/config';

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

  try {
    return NextResponse.json({
      enabled: Boolean(getConfig().monitors.wanIp?.enabled),
      changes: db.getWanIpChanges(limit),
    });
  } catch (error) {
    console.error('Error fetching WAN IP changes:', error);
    return NextResponse.json({ error: 'Failed to fetch WAN IP changes' }, { status: 500 });
  }
}
