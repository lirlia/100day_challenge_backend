import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { RP_ID } from '@/app/_lib/config';
import { stringToUint8Array } from '@/app/_lib/utils';
import { Passkey } from '@prisma/client';

// 仮のユーザー認証: ヘッダーから 'x-user-id' を取得
function getUserIdFromRequest(request: NextRequest): string | null {
  return request.headers.get('x-user-id');
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Passkey Register Start] User ${userId} starting new passkey registration`);

  try {
    // ユーザー情報を取得（パスキーも含む）
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { passkeys: true },
    });

    if (!user) {
      console.log(`[Passkey Register Start] User not found: ${userId}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 既存のパスキー情報を取得 (excludeCredentials用)
    const existingAuthenticators = user.passkeys.map((pk: Passkey) => ({
        id: Buffer.from(pk.credentialId, 'base64url'),
        type: 'public-key' as const,
        transports: JSON.parse(pk.transports),
    })); // id は Uint8Array, transports は string[]

    const options = await generateRegistrationOptions({
      rpName: 'Passkey Demo App',
      rpID: RP_ID as string,
      userID: stringToUint8Array(user.id), // 永続的なユーザーID (Uint8Array)
      userName: user.email, // email を表示名として使う
      userDisplayName: user.email,
      // 既に登録済みの認証器は除外
      excludeCredentials: existingAuthenticators,
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
      attestationType: 'none',
    });

    // チャレンジをDBに保存
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    try {
        await db.challenge.create({
            data: {
                challenge: options.challenge,
                userId: user.id, // ログイン済みユーザーID
                type: 'registration', // 新規パスキー登録用
                expiresAt: expiresAt,
            }
        });
        console.log(
          `[Passkey Register Start] Stored challenge ${options.challenge} for user ${userId}`,
        );
    } catch (dbError) {
        console.error('[Passkey Register Start] Failed to store challenge:', dbError);
        return NextResponse.json({ error: 'Failed to start passkey registration' }, { status: 500 });
    }

    console.log(`[Passkey Register Start] Generated options for user ${userId}:`, options);
    return NextResponse.json(options);

  } catch (error) {
    console.error('[Passkey Register Start] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to start passkey registration' },
      { status: 500 },
    );
  }
}
