import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  try {
    const randomString = crypto.randomBytes(8).toString('hex');
    console.log(`[Dummy API /api/random] Responding with random string: ${randomString}`);
    return NextResponse.json({ randomString });
  } catch (error) {
    console.error('[Dummy API /api/random] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
