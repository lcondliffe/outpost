import { NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET() {
  try {
    const results = db.getLatestDns();
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching latest DNS:', error);
    return NextResponse.json({ error: 'Failed to fetch latest DNS' }, { status: 500 });
  }
}
