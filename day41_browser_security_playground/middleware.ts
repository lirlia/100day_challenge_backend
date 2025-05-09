import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface SecuritySettings {
  csp?: string;
  hsts?: { enabled: boolean; maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  xContentTypeOptions?: 'nosniff' | null;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | null;
  referrerPolicy?: string | null;
  permissionsPolicy?: string | null;
}

const COOKIE_NAME = 'security-settings';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next(); // 元のリクエストに対するレスポンスをまず生成
  const requestCookies = await cookies(); // ここに await を追加
  const settingsCookie = requestCookies.get(COOKIE_NAME);

  if (settingsCookie && settingsCookie.value) {
    try {
      const settings: SecuritySettings = JSON.parse(settingsCookie.value);

      // CSP
      if (settings.csp) {
        response.headers.set('Content-Security-Policy', settings.csp);
      }

      // HSTS
      if (settings.hsts && settings.hsts.enabled) {
        let hstsValue = `max-age=${settings.hsts.maxAge || 31536000}`;
        if (settings.hsts.includeSubDomains) hstsValue += '; includeSubDomains';
        if (settings.hsts.preload) hstsValue += '; preload';
        response.headers.set('Strict-Transport-Security', hstsValue);
      }

      // X-Content-Type-Options
      if (settings.xContentTypeOptions === 'nosniff') {
        response.headers.set('X-Content-Type-Options', 'nosniff');
      }

      // X-Frame-Options
      if (settings.xFrameOptions) {
        response.headers.set('X-Frame-Options', settings.xFrameOptions);
      } else {
        // X-Frame-Options が設定されていなければ、より新しい CSP frame-ancestors を推奨
        // ここではデモのため、明示的にクリアする (またはデフォルトを設定する)
        // response.headers.delete('X-Frame-Options'); // 明示的に削除する場合
      }

      // Referrer-Policy
      if (settings.referrerPolicy) {
        response.headers.set('Referrer-Policy', settings.referrerPolicy);
      }

      // Permissions-Policy
      if (settings.permissionsPolicy) {
        response.headers.set('Permissions-Policy', settings.permissionsPolicy);
      }

    } catch (e) {
      console.error('Error applying security settings from cookie in middleware:', e);
    }
  }

  // CORSヘッダー (これはAPIルート側でより細かく制御することが多いが、全体に適用の例)
  // 今回はCORSデモページで個別に設定するため、ここではコメントアウト
  // response.headers.set('Access-Control-Allow-Origin', '*');
  // response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  // response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  /* --- CORS Demo: Local API Control (現在は外部APIでのCORSエラー確認に主眼を置いているためコメントアウト) --- //
  // 以下のコードブロックを編集して、ローカルAPI (/api/demos/cors-test) へのCORSを制御します。
  // 現在は、意図的に異なるオリジンからのアクセスのみを許可するように設定されており、
  // http://localhost:3001 からのアクセスではCORSエラーが発生します。
  // Access-Control-Allow-Origin の値を '*', または 'http://localhost:3001' に変更するとエラーが解消されます。

  if (request.nextUrl.pathname.startsWith('/api/demos/cors-test')) {
    console.log('[Middleware] Modifying response headers for /api/demos/cors-test');
    response.headers.set('Access-Control-Allow-Origin', 'http://some-other-domain.com');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-custom-allow-cors');

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }
    return response; // GET リクエストの場合も変更されたレスポンスを返す
  }
  // --- End CORS Demo --- */

  return response;
}

// Middlewareを適用するパスを指定
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
