import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { passkeyId: string } },
) {
  const userId = getUserIdFromRequest(request);
  const { passkeyId } = params;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!passkeyId) {
    return NextResponse.json({ error: 'Passkey ID is required' }, { status: 400 });
  }

  console.log(`[Passkey DELETE] User ${userId} attempting to delete passkey ${passkeyId}`);

  try {
    // 指定された passkeyId が、ログインユーザーのものであることを確認して削除
    const deleteResult = await db.passkey.deleteMany({
      where: {
        id: passkeyId,
        userId: userId, // 自分のパスキーしか削除できないようにする
      },
    });

    if (deleteResult.count === 0) {
      console.log(`[Passkey DELETE] Passkey not found or not owned by user: ${passkeyId}`);
      // 見つからない場合、あるいは他人のパスキーだった場合
      return NextResponse.json({ error: 'Passkey not found or forbidden' }, { status: 404 });
    }

    console.log(`[Passkey DELETE] Successfully deleted passkey ${passkeyId} for user ${userId}`);
    return NextResponse.json({ success: true }, { status: 200 }); // 204 No Content も適切

  } catch (error) {
    console.error('[Passkey DELETE] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to delete passkey' },
      { status: 500 },
    );
  }
}
