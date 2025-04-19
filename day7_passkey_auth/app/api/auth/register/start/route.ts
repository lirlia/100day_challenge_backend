import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { db } from '@/lib/db'; // Prisma client
import { RP_ID, RP_ORIGIN } from '@/app/_lib/config';
import { stringToUint8Array } from '@/app/_lib/utils'; // Assuming utils file exists or will be created

export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = body.email;
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    console.log(`[Register Start] Received request for email: ${email}`);
  } catch (error) {
    console.error('[Register Start] Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // ユーザーが既に存在するかチェック
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(`[Register Start] User already exists: ${email}`);
      // 既に存在するユーザーには新しいパスキー登録を許可する（ログイン後のフロー）か、
      // ここではエラーを返すか、ログインを促すメッセージを返すか選択。
      // 今回は、既存ユーザーの初期登録はエラーとする。
      return NextResponse.json(
        { error: 'User already exists. Please login.' },
        { status: 409 }, // Conflict
      );
    }

    // ユーザーが存在しない場合、登録オプションを生成
    // 注意: この時点ではユーザーIDは未確定だが、SimpleWebAuthnは `userID` を必要とする
    // 一時的なIDを生成するか、emailを仮の識別子として使う。
    // 今回はシンプルに email を仮の識別子とし、認証器取得は空配列を返すように session-store 側で実装済み。
    const options = await generateRegistrationOptions({
      rpName: 'Passkey Demo App', // アプリケーション名
      rpID: RP_ID as string, // config.tsでチェック済みなので型アサーションを使用
      // userIDはUint8Arrayである必要があるので、emailを変換
      userID: stringToUint8Array(email),
      userName: email, // ユーザー表示名
      userDisplayName: email,
      // 既存の認証器を除外する設定 (今回は新規登録なので空)
      excludeCredentials: [],
      authenticatorSelection: {
        // authenticatorAttachment: 'platform', // 'platform' or 'cross-platform' or undefined
        residentKey: 'required', // Discoverable Credential (Passkey) を要求
        requireResidentKey: true,
        userVerification: 'preferred', // 生体認証などを推奨
      },
      attestationType: 'none', // Attestation は今回検証しない
    });

    // 生成されたチャレンジをDBに保存
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分有効
    try {
      await db.challenge.create({
        data: {
          challenge: options.challenge,
          userId: email, // 登録前なので email を仮の識別子として保存
          type: 'registration',
          expiresAt: expiresAt,
        },
      });
      console.log(
        `[Register Start] Stored registration challenge ${options.challenge} for ${email}`,
      );
    } catch (dbError) {
      console.error('[Register Start] Failed to store challenge. Error details:', dbError);
      // エラーオブジェクト全体を出力
      return NextResponse.json({ error: 'Failed to start registration' }, { status: 500 });
    }

    console.log('[Register Start] Generated registration options for:', email, options);

    // オプションをクライアントに返す
    return NextResponse.json(options);
  } catch (error) {
    console.error('[Register Start] Failed to generate registration options:', error);
    return NextResponse.json(
      { error: 'Failed to start registration' },
      { status: 500 },
    );
  }
}
