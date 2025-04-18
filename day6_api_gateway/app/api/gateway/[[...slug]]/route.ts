import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  getApiKeyInfo,
  checkRateLimit,
  addLog,
  LogEntry,
} from '@/lib/store'; // エイリアス @ を使用

// --- 型定義 ---
interface RouteConfig {
  pathPrefix: string;
  targetUrl: string;
  stripPrefix: boolean;
}

// --- 設定読み込み ---
const ROUTES_PATH = path.join(process.cwd(), 'config', 'routes.json');
let routes: RouteConfig[] = [];
try {
  const rawData = fs.readFileSync(ROUTES_PATH, 'utf-8');
  routes = JSON.parse(rawData);
  console.log('[Gateway] Loaded route configuration.');
} catch (error) {
  console.error('[Gateway] Error loading route configuration:', error);
}

// --- メインハンドラー --- //
async function handler(req: NextRequest) {
  const requestPath = req.nextUrl.pathname; // 例: /api/gateway/time
  const method = req.method;
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';

  let apiKey: string | null = null;
  let logEntryBase: Omit<LogEntry, 'timestamp' | 'status'> = {
    apiKey,
    method,
    path: requestPath,
    ip,
  };

  console.log(`[Gateway] Received request: ${method} ${requestPath} from ${ip}`);

  // 1. APIキー認証
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    addLog({ ...logEntryBase, status: 401, message: 'Missing or invalid Authorization header' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  apiKey = authHeader.substring(7); // "Bearer " の後
  logEntryBase.apiKey = apiKey; // ログ用に更新

  const apiKeyInfo = getApiKeyInfo(apiKey);
  if (!apiKeyInfo) {
    addLog({ ...logEntryBase, status: 403, message: 'Invalid API Key' });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. レートリミットチェック
  const rateLimitResult = checkRateLimit(apiKey);
  if (!rateLimitResult.allowed) {
    addLog({ ...logEntryBase, status: 429, message: 'Rate limit exceeded' });
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  // 3. ルーティング
  const matchedRoute = routes.find((route) => requestPath.startsWith(route.pathPrefix));

  if (!matchedRoute) {
    addLog({ ...logEntryBase, status: 404, message: 'No matching route found' });
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // 4. ターゲットURL計算
  let targetPath = requestPath;
  if (matchedRoute.stripPrefix) {
    targetPath = requestPath.substring(matchedRoute.pathPrefix.length);
  }
  const targetUrl = matchedRoute.targetUrl + targetPath + req.nextUrl.search; // クエリパラメータも引き継ぐ
  logEntryBase.targetUrl = targetUrl; // ログ用

  console.log(`[Gateway] Routing to: ${targetUrl}`);

  // 5. リクエスト転送
  try {
    const backendResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        // 必要なヘッダーのみ転送 (Authorization は削除するなど検討)
        'Content-Type': req.headers.get('Content-Type') || '',
        'Accept': req.headers.get('Accept') || '',
        // X-Forwarded-For など、必要に応じて追加
        'X-Forwarded-For': ip,
      },
      body: req.body,
      // duplex: 'half' は Node v18 以降で POST/PUT リクエストに必要
      // しかし Next.js の Edge Runtime ではサポートされない場合があるため注意
      // @ts-ignore
      duplex: 'half',
    });

    // 6. レスポンスをクライアントに返す
    const responseHeaders = new Headers(backendResponse.headers);
    // 必要に応じてレスポンスヘッダーを加工
    responseHeaders.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());

    // レスポンスボディをストリームで返す（大きなレスポンスに対応）
    const response = new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });

    console.log(`[Gateway] Forwarded request to ${targetUrl}, Status: ${backendResponse.status}`);
    addLog({ ...logEntryBase, status: backendResponse.status });
    return response;

  } catch (error) {
    console.error(`[Gateway] Error forwarding request to ${targetUrl}:`, error);
    addLog({ ...logEntryBase, status: 502, message: `Backend request failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    return NextResponse.json({ error: 'Bad Gateway' }, { status: 502 });
  }
}

// すべてのメソッドに対応
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
export const OPTIONS = handler;
