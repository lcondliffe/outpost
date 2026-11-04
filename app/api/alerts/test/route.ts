import { NextResponse } from 'next/server';
import { sendTest } from '@/src/alerts';

export async function POST() {
  try {
    const results = await sendTest();
    if (results.length === 0) {
      return NextResponse.json({ success: false, error: 'No notification sinks configured' }, { status: 400 });
    }
    return NextResponse.json({ success: results.every((r) => r.ok), results });
  } catch (error) {
    console.error('Error sending test notification:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
