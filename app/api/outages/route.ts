import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const now = Date.now();
  const defaultStart = now - 24 * 60 * 60 * 1000;

  const start = parseInt(searchParams.get('start') || String(defaultStart), 10);
  const end = parseInt(searchParams.get('end') || String(now), 10);
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');

  try {
    let outages = db.getOutages(start, end);

    // Parse affected_services JSON
    outages = outages.map((o: any) => ({
      ...o,
      affected_services: JSON.parse(o.affected_services || '[]'),
    }));

    if (status === 'active') {
      outages = outages.filter((o: any) => o.end_time === null);
    } else if (status === 'resolved') {
      outages = outages.filter((o: any) => o.end_time !== null);
    }

    if (limit) {
      outages = outages.slice(0, parseInt(limit, 10));
    }

    return NextResponse.json(outages);
  } catch (error) {
    console.error('Error fetching outages:', error);
    return NextResponse.json({ error: 'Failed to fetch outages' }, { status: 500 });
  }
}
