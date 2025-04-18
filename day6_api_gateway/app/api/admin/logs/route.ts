import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/store';

// 認証などを追加することも検討（今回は省略）

export async function GET() {
  try {
    const logs = getLogs();
    return NextResponse.json(logs);
  } catch (error) {
    console.error('[Admin API /logs] Error fetching logs:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
