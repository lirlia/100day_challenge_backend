import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse } from '@/lib/types';
import { simulateJobExecution } from '@/lib/jobs';
import { prisma } from '@/lib/db';

// ジョブを手動で実行
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Next.js 15ではparamsを非同期でアクセスする必要がある
    const paramsObj = await params;
    const { id } = paramsObj;

    // ジョブの存在確認
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '指定されたジョブが見つかりません',
      }, { status: 404 });
    }

    // ジョブが無効の場合は実行できない
    if (!job.isActive) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '無効なジョブは実行できません',
      }, { status: 400 });
    }

    // ジョブの実行をシミュレート
    const success = await simulateJobExecution(id);

    if (!success) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'ジョブの実行に失敗しました',
      }, { status: 500 });
    }

    return NextResponse.json<ApiResponse<{ message: string }>>({
      success: true,
      data: { message: 'ジョブの実行を開始しました' },
    });
  } catch (error) {
    console.error(`Error running job ${params.id}:`, error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの実行に失敗しました',
    }, { status: 500 });
  }
}
