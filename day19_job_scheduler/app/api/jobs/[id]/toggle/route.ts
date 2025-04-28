import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateNextRunTime } from '@/lib/jobs';
import { ApiResponse } from '@/lib/types';

// ジョブの有効/無効を切り替えるAPI
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

    // 有効/無効を切り替え
    const isActive = !job.isActive;

    // 有効化する場合は次回実行時間を設定
    let nextRunAt = job.nextRunAt;
    if (isActive && !nextRunAt) {
      nextRunAt = calculateNextRunTime(
        job.scheduleType,
        job.scheduledAt,
        job.interval,
        job.intervalUnit
      );
    }

    // ジョブの更新
    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        isActive,
        ...(nextRunAt && { nextRunAt }),
      },
    });

    return NextResponse.json<ApiResponse<typeof updatedJob>>({
      success: true,
      data: updatedJob,
    });
  } catch (error) {
    console.error(`Error toggling job ${params.id}:`, error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの状態切り替えに失敗しました',
    }, { status: 500 });
  }
}
