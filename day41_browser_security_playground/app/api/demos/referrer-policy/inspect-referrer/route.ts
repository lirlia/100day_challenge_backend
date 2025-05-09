import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET(request: NextRequest) {
  const headerList = await headers();
  const referer = headerList.get('referer');

  return NextResponse.json({ referer: referer || null });
}
