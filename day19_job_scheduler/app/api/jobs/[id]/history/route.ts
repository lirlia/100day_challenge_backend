import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiResponse } from '@/lib/types';

// ジョブの実行履歴を取得
export async function GET(
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

    // 履歴を取得（最新順）
    const history = await prisma.jobHistory.findMany({
      where: { jobId: id },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        jobId: true,
        startedAt: true,
        finishedAt: true,
        status: true,
        output: true,
        error: true,
        createdAt: true
      }
    });

    return NextResponse.json<ApiResponse<typeof history>>({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error(`Error fetching history for job ${params.id}:`, error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: '履歴の取得に失敗しました',
    }, { status: 500 });
  }
}
