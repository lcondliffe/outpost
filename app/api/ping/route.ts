import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const now = Date.now();
  const defaultStart = now - 24 * 60 * 60 * 1000;

  const start = parseInt(searchParams.get('start') || String(defaultStart), 10);
  const end = parseInt(searchParams.get('end') || String(now), 10);
  const target = searchParams.get('target');

  try {
    const results = target
      ? db.getPingResultsByTarget(start, end, target)
      : db.getPingResults(start, end);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching ping results:', error);
    return NextResponse.json({ error: 'Failed to fetch ping results' }, { status: 500 });
  }
}
