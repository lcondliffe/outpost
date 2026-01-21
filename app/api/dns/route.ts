import { NextRequest, NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const now = Date.now();
  const defaultStart = now - 24 * 60 * 60 * 1000;

  const start = parseInt(searchParams.get('start') || String(defaultStart), 10);
  const end = parseInt(searchParams.get('end') || String(now), 10);
  const server = searchParams.get('server');

  try {
    const results = server
      ? db.getDnsResultsByServer(start, end, server)
      : db.getDnsResults(start, end);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching DNS results:', error);
    return NextResponse.json({ error: 'Failed to fetch DNS results' }, { status: 500 });
  }
}
