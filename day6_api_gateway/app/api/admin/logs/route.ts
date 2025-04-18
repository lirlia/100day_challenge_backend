import { NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/store';

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

// DELETE: インメモリログを削除
export async function DELETE() {
    try {
        clearLogs();
        console.log('[Admin API /logs] Cleared logs successfully.');
        // 成功時は 204 No Content または 200 OK を返すのが一般的
        // return new NextResponse(null, { status: 204 });
        return NextResponse.json({ message: 'Logs cleared successfully' });
    } catch (error) {
        console.error('[Admin API /logs] Error clearing logs:', error);
        return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 },
        );
    }
}
