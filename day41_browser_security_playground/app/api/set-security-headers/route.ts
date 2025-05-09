import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// 保存する設定の型定義 (例)
interface SecuritySettings {
  csp?: string;
  hsts?: { enabled: boolean; maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  xContentTypeOptions?: 'nosniff' | null;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | null;
  referrerPolicy?: string | null; // Referrer-Policy は多様な値を取りうる
  permissionsPolicy?: string | null; // Permissions-Policy も同様
  // 必要に応じて他のヘッダーも追加
}

const COOKIE_NAME = 'security-settings';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { headerName, headerValue, enabled, maxAge, includeSubDomains, preload, action } = body;

    const cookieStore = await cookies();
    let currentSettings: SecuritySettings = {};
    const existingCookie = cookieStore.get(COOKIE_NAME);

    if (existingCookie && existingCookie.value) {
      try {
        currentSettings = JSON.parse(existingCookie.value);
      } catch (e) {
        console.error('Failed to parse existing security settings cookie:', e);
        // エラー時は空の設定から開始
      }
    }

    if (action === 'clearAll') {
      currentSettings = {};
    } else if (action === 'clear') {
      if (headerName) {
        delete (currentSettings as any)[headerName];
      }
    } else if (action === 'set') {
      switch (headerName) {
        case 'csp':
          currentSettings.csp = headerValue as string;
          break;
        case 'hsts':
          currentSettings.hsts = { enabled, maxAge, includeSubDomains, preload };
          break;
        case 'xContentTypeOptions':
          currentSettings.xContentTypeOptions = enabled ? 'nosniff' : null;
          break;
        case 'xFrameOptions':
          currentSettings.xFrameOptions = enabled ? headerValue as ('DENY' | 'SAMEORIGIN') : null;
          break;
        case 'referrerPolicy':
          currentSettings.referrerPolicy = enabled ? headerValue as string : null;
          break;
        case 'permissionsPolicy':
          currentSettings.permissionsPolicy = enabled ? headerValue as string : null;
          break;
        // 他のヘッダーのケースを追加
        default:
          return NextResponse.json({ message: 'Invalid header name' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ message: 'Invalid action' }, { status: 400 });
    }

    cookieStore.set(COOKIE_NAME, JSON.stringify(currentSettings), {
      path: '/',
      httpOnly: true, // クライアントJSからのアクセスを防ぐ
      secure: process.env.NODE_ENV === 'production', // 本番環境ではHTTPSのみ
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
    });

    return NextResponse.json({ message: 'Settings updated', settings: currentSettings });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get(COOKIE_NAME);
  if (settingsCookie && settingsCookie.value) {
    try {
      const settings = JSON.parse(settingsCookie.value);
      return NextResponse.json(settings);
    } catch (e) {
      console.error('Failed to parse security settings cookie for GET:', e);
      return NextResponse.json({}, { status: 200 }); // パース失敗時は空を返す
    }
  }
  return NextResponse.json({}, { status: 200 }); // Cookieがなければ空を返す
}
