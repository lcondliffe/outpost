import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  try {
    const outages = db.getRecentOutages(limit);

    const parsed = outages.map((o: any) => ({
      ...o,
      affected_services: JSON.parse(o.affected_services || '[]'),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching recent outages:', error);
    return NextResponse.json({ error: 'Failed to fetch recent outages' }, { status: 500 });
  }
}
