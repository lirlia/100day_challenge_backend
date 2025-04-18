import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const currentTime = new Date().toISOString();
    console.log(`[Dummy API /api/time] Responding with current time: ${currentTime}`);
    return NextResponse.json({ currentTime });
  } catch (error) {
    console.error('[Dummy API /api/time] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
