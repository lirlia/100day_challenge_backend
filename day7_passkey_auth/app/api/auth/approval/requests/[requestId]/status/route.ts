import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } },
) {
  const { requestId } = params;

  if (!requestId) {
    return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
  }

  // このAPIは認証不要（requestIdを知っていることが前提）とするか、
  // requestingDeviceId などを使ってリクエスト元を検証する必要がある。
  // 今回はシンプルに requestId のみで検索する。
  console.log(`[Approval Status] Checking status for request ${requestId}`);

  try {
    const approvalRequest = await db.deviceApprovalRequest.findUnique({
      where: {
        id: requestId,
      },
      select: {
        status: true,
        // 必要であれば他の情報も返す (例: userId)
      },
    });

    if (!approvalRequest) {
      console.log(`[Approval Status] Request not found: ${requestId}`);
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    console.log(
      `[Approval Status] Status for request ${requestId}: ${approvalRequest.status}`,
    );
    return NextResponse.json({ status: approvalRequest.status });

  } catch (error) {
    console.error('[Approval Status] Failed to fetch status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch approval status' },
      { status: 500 },
    );
  }
}
