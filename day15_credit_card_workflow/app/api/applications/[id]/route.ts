import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { ApplicationStatus, Prisma } from '../../../generated/prisma'; // Adjust relative path
import { canTransition } from '@/app/_lib/stateMachine'; // Import state machine logic

// GET /api/applications/[id] - 特定申請の詳細取得 (履歴含む)
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Ensure params are awaited before accessing properties in newer Next.js versions
    const awaitedParams = await params;
    const id = awaitedParams.id;
    const application = await prisma.creditCardApplication.findUnique({
      where: { id },
      include: {
        histories: {
          orderBy: {
            timestamp: 'asc', // 履歴は古い順に表示
          },
        },
      },
    });

    if (!application) {
      return new NextResponse("Application not found", { status: 404 });
    }

    return NextResponse.json(application);
  } catch (error) {
    console.error("[API_APPLICATIONS_ID_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// PATCH /api/applications/[id] - 申請の状態遷移
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Ensure params are awaited before accessing properties in newer Next.js versions
    await params;
    const id = params.id;
    // In Next.js 15+, route params might be async, ensure awaited if needed
    // await params; // Uncomment if using Next.js 15+ features causing issues

    const body = await req.json();
    const { action, notes } = body;

    if (!action) {
      return new NextResponse("Action is required", { status: 400 });
    }

    // 1. 現在の申請データを取得
    const currentApplication = await prisma.creditCardApplication.findUnique({
      where: { id },
    });

    if (!currentApplication) {
      return new NextResponse("Application not found", { status: 404 });
    }

    // 2. ステートマシンで遷移可能か検証
    const nextStatus = canTransition(currentApplication.status, action);

    if (!nextStatus) {
      // 遷移不可能なアクションが指定された
      return new NextResponse(
        `Invalid action '${action}' for current status '${currentApplication.status}'`,
        { status: 400 }
      );
    }

    // 3. トランザクション内で状態更新と履歴記録を実行
    const updatedApplication = await prisma.$transaction(async (tx) => {
      // 3a. 申請の状態を更新
      const updated = await tx.creditCardApplication.update({
        where: { id },
        data: { status: nextStatus },
      });

      // 3b. 遷移履歴を記録
      await tx.applicationHistory.create({
        data: {
          applicationId: id,
          fromStatus: currentApplication.status,
          toStatus: nextStatus,
          notes: notes, // Optional notes from request
        },
      });

      return updated; // トランザクションの結果として更新後の申請データを返す
    });

    // 4. 更新後のデータを返す (履歴は含まない簡略版)
    // 詳細が必要な場合は再度 findUnique するか、トランザクション内で include する
    return NextResponse.json(updatedApplication);

  } catch (error) {
    console.error("[API_APPLICATIONS_ID_PATCH]", error);
    // エラーハンドリング (例: DBエラーなど) をここに追加可能
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
