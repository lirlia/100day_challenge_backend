import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { Passkey } from '@prisma/client'; // Prisma の型をインポート

export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = body.email;
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    console.log(`[Login Start] Received request for email: ${email}`);
  } catch (error) {
    console.error('[Login Start] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // ユーザーが存在するかチェック
    const user = await db.user.findUnique({
      where: { email },
      include: { passkeys: true }, // 登録済みのパスキーも取得
    });

    if (!user) {
      console.log(`[Login Start] User not found: ${email}`);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ユーザーに紐づくパスキー (Authenticator) の情報を取得
    const userAuthenticators = user.passkeys.map((pk: Passkey) => ({
      // credentialID は generateAuthenticationOptions の allowCredentials では
      // Base64URL 文字列のまま渡す必要があるため、Buffer変換は不要
      credentialID_db: pk.credentialId, // DBから取得した Base64URL 文字列
      transports: JSON.parse(pk.transports),
    }));

    console.log(`[Login Start] Found ${userAuthenticators.length} authenticators for user ${email}`);

    const options = await generateAuthenticationOptions({
      rpID: RP_ID as string,
      allowCredentials: userAuthenticators.map((auth) => ({
        id: auth.credentialID_db, // Base64URL 文字列を使用
        type: 'public-key',
        transports: auth.transports,
      })),
      userVerification: 'preferred', // 生体認証などを推奨
    });

    // 生成されたチャレンジをDBに保存
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    try {
        await db.challenge.create({
            data: {
                challenge: options.challenge,
                userId: user.id, // ログイン時はユーザーIDを紐付ける
                type: 'authentication',
                expiresAt: expiresAt,
            }
        });
        console.log(
          `[Login Start] Stored authentication challenge ${options.challenge} for user ${user.id}`,
        );
    } catch (dbError) {
        console.error('[Login Start] Failed to store challenge:', dbError);
        return NextResponse.json({ error: 'Failed to start login' }, { status: 500 });
    }

    console.log('[Login Start] Generated authentication options for:', email, options);

    // オプションをクライアントに返す
    return NextResponse.json(options);
  } catch (error) {
    console.error('[Login Start] Failed to generate authentication options:', error);
    return NextResponse.json(
      { error: 'Failed to start login' },
      { status: 500 },
    );
  }
}
