import { NextRequest, NextResponse } from 'next/server';
import {
  getAllApiKeyInfo,
  updateApiKeyRateLimit,
  getApiKeyInfo,
} from '@/lib/store';

// 認証などを追加することも検討（今回は省略）

// GET: 現在の全APIキーのレートリミット設定を取得
export async function GET() {
  try {
    const allInfo = getAllApiKeyInfo();
    return NextResponse.json(allInfo);
  } catch (error) {
    console.error('[Admin API /rate-limit] Error fetching rate limits:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

// POST: 特定のAPIキーのレートリミット設定を更新
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiKey, rateLimit, interval, limit } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    let newRateLimit: { interval: number; limit: number } | null = null;

    // rateLimit オブジェクト、または interval/limit が直接指定されているかチェック
    if (rateLimit === null) {
      newRateLimit = null; // レートリミット解除
    } else if (rateLimit && typeof rateLimit === 'object' && 'interval' in rateLimit && 'limit' in rateLimit) {
        newRateLimit = {
            interval: parseInt(rateLimit.interval, 10),
            limit: parseInt(rateLimit.limit, 10),
        };
    } else if (interval !== undefined && limit !== undefined) {
      newRateLimit = {
        interval: parseInt(interval, 10),
        limit: parseInt(limit, 10),
      };
    }

    // interval と limit が数値であることを確認
    if (newRateLimit && (isNaN(newRateLimit.interval) || isNaN(newRateLimit.limit) || newRateLimit.interval <= 0 || newRateLimit.limit < 0)) {
      return NextResponse.json({ error: 'Invalid interval or limit value' }, { status: 400 });
    }

    // 存在しない API Key を指定された場合の考慮（オプション）
    if (!getApiKeyInfo(apiKey)) {
        // return NextResponse.json({ error: `API Key '${apiKey}' not found` }, { status: 404 });
        // もしくは新規作成を許可する？今回は更新のみとする
        console.warn(`[Admin API /rate-limit] Attempted to update non-existent API Key: ${apiKey}`);
         return NextResponse.json({ error: `API Key '${apiKey}' not found` }, { status: 404 });
    }


    const success = updateApiKeyRateLimit(apiKey, newRateLimit);

    if (success) {
        console.log(`[Admin API /rate-limit] Successfully updated rate limit for ${apiKey}`);
      return NextResponse.json({ success: true, apiKey, newRateLimit });
    } else {
      // updateApiKeyRateLimit 内で false が返るのは現状 apiKey が存在しない場合のみだが念のため
      console.error(`[Admin API /rate-limit] Failed to update rate limit for ${apiKey}`);
      return NextResponse.json(
        { error: 'Failed to update rate limit' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('[Admin API /rate-limit] Error updating rate limit:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
