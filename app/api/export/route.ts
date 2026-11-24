import { NextRequest, NextResponse } from 'next/server';
import { QUERIES, FORMATS, exportChunks } from '@/src/export';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get('type') || '';
  const format = searchParams.get('format') || 'csv';
  const now = Date.now();
  const start = parseInt(searchParams.get('start') || String(now - 24 * 60 * 60 * 1000), 10);
  const end = parseInt(searchParams.get('end') || String(now), 10);

  if (!Object.hasOwn(QUERIES, type)) {
    return NextResponse.json({ error: `type must be one of: ${Object.keys(QUERIES).join(', ')}` }, { status: 400 });
  }
  if (!FORMATS.includes(format)) {
    return NextResponse.json({ error: `format must be one of: ${FORMATS.join(', ')}` }, { status: 400 });
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NextResponse.json({ error: 'start and end must be unix millisecond timestamps' }, { status: 400 });
  }

  let chunks: Generator<string>;
  try {
    chunks = exportChunks(type, format, start, end);
  } catch (error) {
    console.error('Error starting export:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      try {
        const { value, done } = chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        console.error('Error streaming export:', error);
        controller.error(error);
      }
    },
    cancel() {
      chunks.return(undefined); // runs the generator's finally: closes the connection
    },
  });

  const filename = `outpost-${type}-${new Date(start).toISOString().slice(0, 10)}-to-${new Date(end).toISOString().slice(0, 10)}.${format}`;
  return new Response(stream, {
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
