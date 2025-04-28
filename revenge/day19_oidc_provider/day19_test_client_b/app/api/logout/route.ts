import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    // Create a response object to clear cookies
    const response = NextResponse.json({ success: true });

    // Clear the cookies by setting them with an expiry date in the past
    response.cookies.set('access_token', '', { path: '/', maxAge: -1 });
    response.cookies.set('id_token', '', { path: '/', maxAge: -1 });

    console.log('[API Logout] Cookies cleared.');
    return response;

  } catch (error) {
    console.error('[API Logout] Error clearing cookies:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
  }
}
