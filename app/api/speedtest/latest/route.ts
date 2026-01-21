import { NextResponse } from 'next/server';
import db from '@/src/storage/database';

export async function GET() {
  try {
    const result = db.getLatestSpeedtest();
    return NextResponse.json(result || { message: 'No speedtest results yet' });
  } catch (error) {
    console.error('Error fetching latest speedtest:', error);
    return NextResponse.json({ error: 'Failed to fetch latest speedtest' }, { status: 500 });
  }
}
