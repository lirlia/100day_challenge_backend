import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, idToken } = body;

    if (!accessToken || !idToken) {
      return NextResponse.json({ error: 'Missing tokens' }, { status: 400 });
    }

    // Create a response object to set cookies
    const response = NextResponse.json({ success: true });

    // Set HttpOnly, Secure cookies on the response
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7, // 1 week
    };

    response.cookies.set('access_token', accessToken, cookieOptions);
    response.cookies.set('id_token', idToken, cookieOptions);

    console.log('[API Save Tokens] Tokens stored in cookies successfully.');
    return response; // Return the response with cookies set

  } catch (error) {
    console.error('[API Save Tokens] Error saving tokens:', error);
    return NextResponse.json({ error: 'Failed to save tokens' }, { status: 500 });
  }
}
