import { NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET() {
  try {
    const results = db.getLatestPings();
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching latest pings:', error);
    return NextResponse.json({ error: 'Failed to fetch latest pings' }, { status: 500 });
  }
}
