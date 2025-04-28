import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ApiResponse, JobRequest } from '@/lib/types';
import { calculateNextRunTime } from '@/lib/jobs';

// ジョブ一覧を取得
export async function GET(req: NextRequest) {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json<ApiResponse<typeof jobs>>({
      success: true,
      data: jobs,
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの取得に失敗しました',
    }, { status: 500 });
  }
}

// 新しいジョブを作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as JobRequest;

    // 必須フィールドの検証
    if (!body.name || !body.command || !body.scheduleType) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '名前、コマンド、スケジュールタイプは必須です',
      }, { status: 400 });
    }

    // スケジュールタイプに応じた追加検証
    if (body.scheduleType === 'once' && !body.scheduledAt) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '一回のみ実行の場合、実行日時は必須です',
      }, { status: 400 });
    }

    if (body.scheduleType === 'interval' && (!body.interval || !body.intervalUnit)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: '定期実行の場合、間隔と単位は必須です',
      }, { status: 400 });
    }

    // 次回実行時間を計算
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    const nextRunAt = calculateNextRunTime(
      body.scheduleType,
      scheduledAt,
      body.interval || null,
      body.intervalUnit || null
    );

    // ジョブの作成
    const job = await prisma.job.create({
      data: {
        name: body.name,
        description: body.description || '',
        command: body.command,
        scheduleType: body.scheduleType,
        scheduledAt: scheduledAt,
        interval: body.interval || null,
        intervalUnit: body.intervalUnit || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        nextRunAt,
      },
    });

    return NextResponse.json<ApiResponse<typeof job>>({
      success: true,
      data: job,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'ジョブの作成に失敗しました',
    }, { status: 500 });
  }
}
