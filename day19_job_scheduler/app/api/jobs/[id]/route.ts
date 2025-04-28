import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiResponse, JobRequest } from '@/lib/types';
import { calculateNextRunTime } from '@/lib/jobs';

// ジョブの詳細を取得するAPI
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Next.js 15ではparamsを非同期でアクセスする必要がある
    const paramsObj = await params;
    const { id } = paramsObj;

    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'ジョブが見つかりません',
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<typeof job>>({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの取得に失敗しました',
    }, { status: 500 });
  }
}

// ジョブを更新するAPI
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Next.js 15ではparamsを非同期でアクセスする必要がある
    const paramsObj = await params;
    const { id } = paramsObj;

    const requestData = await request.json();

    // ジョブの存在確認
    const existingJob = await prisma.job.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'ジョブが見つかりません',
      }, { status: 404 });
    }

    // 更新データの検証
    const { name, description, command, scheduleType, scheduledAt, interval, intervalUnit } = requestData;

    if (!name || !command) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'ジョブ名とコマンドは必須です',
      }, { status: 400 });
    }

    // スケジュールタイプに応じたバリデーション
    if (scheduleType === 'once' && !scheduledAt) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '一回のみ実行の場合は実行日時が必須です',
      }, { status: 400 });
    }

    if (scheduleType === 'interval' && (!interval || !intervalUnit)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '定期実行の場合は間隔と単位が必須です',
      }, { status: 400 });
    }

    // 更新データを構築
    const updateData: Record<string, any> = {
      name,
      description,
      command,
      ...(scheduleType && { scheduleType }),
      ...(scheduleType === 'once' && scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      ...(scheduleType === 'interval' && interval && { interval }),
      ...(scheduleType === 'interval' && intervalUnit && { intervalUnit }),
    };

    // スケジュール設定が変更された場合、次回実行時間を再計算
    if (
      scheduleType !== undefined ||
      scheduledAt !== undefined ||
      interval !== undefined ||
      intervalUnit !== undefined
    ) {
      const newScheduleType = scheduleType || existingJob.scheduleType;
      const newScheduledAt = scheduledAt ? new Date(scheduledAt) : existingJob.scheduledAt;
      const newInterval = interval !== undefined ? interval : existingJob.interval;
      const newIntervalUnit = intervalUnit || existingJob.intervalUnit;

      updateData.nextRunAt = calculateNextRunTime(
        newScheduleType,
        newScheduledAt,
        newInterval,
        newIntervalUnit
      );
    }

    // ジョブを更新
    const updatedJob = await prisma.job.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json<ApiResponse<typeof updatedJob>>({
      success: true,
      data: updatedJob,
    });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの更新に失敗しました',
    }, { status: 500 });
  }
}

// ジョブを削除するAPI
export async function DELETE(
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
        error: 'ジョブが見つかりません',
      }, { status: 404 });
    }

    // ジョブの関連履歴も含めて削除（カスケード）
    await prisma.job.delete({
      where: { id },
    });

    return NextResponse.json<ApiResponse<null>>({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの削除に失敗しました',
    }, { status: 500 });
  }
}
