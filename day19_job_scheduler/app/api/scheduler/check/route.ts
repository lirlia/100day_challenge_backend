import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '@/lib/types';
import { checkAndRunDueJobs } from '@/lib/jobs';

// 実行期限が来たジョブをチェックして実行
export async function GET(req: NextRequest) {
  try {
    const count = await checkAndRunDueJobs();

    return NextResponse.json<ApiResponse<{ count: number }>>({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Error checking due jobs:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブのチェックに失敗しました',
    }, { status: 500 });
  }
}
