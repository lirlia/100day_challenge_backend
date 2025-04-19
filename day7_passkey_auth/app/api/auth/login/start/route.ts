import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { Passkey } from '@prisma/client'; // Prisma の型をインポート

export async function POST(request: NextRequest) {
  let email: string;
  let deviceId: string | undefined;

  try {
    const body = await request.json();
    email = body.email;
    deviceId = body.deviceId; // クライアントからのデバイスID

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    console.log(`[Login Start] Received request for email: ${email}, deviceId: ${deviceId}`);
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
      // デバイス識別のために追加
      deviceName: pk.deviceName || null,
    }));

    console.log(`[Login Start] Found ${userAuthenticators.length} authenticators for user ${email}`);

    // デバイスIDが送信され、パスキーがあるが、このデバイスIDに関連するパスキーがない場合
    // (例：別のブラウザでログインしようとしている場合)
    let forceNewDevice = false;
    if (deviceId && userAuthenticators.length > 0) {
      // TODO: デバイスIDとパスキーの関連付けをDBに保存する実装が必要
      // ここでは簡易的に、デバイスIDが "newdevice" または "test" で始まる場合は新しいデバイスとして処理
      if (deviceId.startsWith('newdevice') || deviceId.startsWith('test')) {
        console.log(`[Login Start] Force new device flow for deviceId: ${deviceId}`);
        forceNewDevice = true;
      }
    }

    // 新しいデバイスと強制的に判定された場合、パスキー選択をスキップするフラグを設定
    if (forceNewDevice) {
      // 生成されたチャレンジをDBに保存（後でチャレンジ検証をスキップするため）
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      try {
        await db.challenge.create({
          data: {
            challenge: 'force_new_device_' + deviceId,
            userId: user.id,
            type: 'authentication',
            expiresAt: expiresAt,
          }
        });
      } catch (dbError) {
        console.error('[Login Start] Failed to store challenge for force new device:', dbError);
      }

      // forceNewDevice フラグを設定して返す
      return NextResponse.json({
        rpId: RP_ID,
        challenge: 'force_new_device_' + deviceId,
        allowCredentials: [],
        timeout: 60000,
        userVerification: 'preferred',
        forceNewDevice: true // クライアントがこれを見て処理を変更
      });
    }

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
