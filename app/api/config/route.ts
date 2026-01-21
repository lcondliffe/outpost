import { NextRequest, NextResponse } from 'next/server';
import { getConfig, updateConfig, CONSTRAINTS } from '@/src/config';
import { restartScheduler } from '@/src/scheduler';

export async function GET() {
  try {
    return NextResponse.json({
      config: getConfig(),
      constraints: CONSTRAINTS,
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const newConfig = updateConfig(body);
    restartScheduler();
    return NextResponse.json({ success: true, config: newConfig });
  } catch (error: any) {
    console.error('Error updating config:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
