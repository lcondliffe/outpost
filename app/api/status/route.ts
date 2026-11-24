import { NextResponse } from 'next/server';
import { getOutageStatus } from '@/src/monitors/outage';
import { getDegradationStatus } from '@/src/monitors/degradation';

export async function GET() {
  try {
    // Existing outage fields are unchanged; `degradation` is additive (AGT-422)
    // and never takes the outage status down with it.
    let degradation = null;
    try {
      degradation = getDegradationStatus();
    } catch (error) {
      console.error('Error evaluating degradation:', error);
    }
    return NextResponse.json({ ...getOutageStatus(), degradation });
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
