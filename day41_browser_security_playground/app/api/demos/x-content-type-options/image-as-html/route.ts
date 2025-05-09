import { NextResponse } from 'next/server';

export async function GET() {
  const htmlBody = '<!DOCTYPE html><html lang="ja"><head><title>HTML as Image</title></head><body><h1>これはHTMLコンテンツです (画像として送信されました)</h1><script>alert("もし nosniff が無効で、かつ sandbox が緩ければ、このスクリプトも実行されるかも？");</script></body></html>';

  // middleware.ts で X-Content-Type-Options が設定されることを期待。
  // ここでは Content-Type を偽装するだけ。
  return new NextResponse(htmlBody, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg', // 偽のContent-Type
    },
  });
}
