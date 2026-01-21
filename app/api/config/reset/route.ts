import { NextResponse } from 'next/server';
import { resetConfig } from '@/src/config';
import { restartScheduler } from '@/src/scheduler';

export async function POST() {
  try {
    const config = resetConfig();
    restartScheduler();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('Error resetting config:', error);
    return NextResponse.json({ error: 'Failed to reset config' }, { status: 500 });
  }
}
