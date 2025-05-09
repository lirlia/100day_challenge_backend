import { NextResponse } from 'next/server';

export async function GET() {
  const scriptBody = "alert('このアラートは text/plain として送信されたコンテンツから実行されました！ MIMEスニッフィングが有効な場合に実行される可能性があります。'); console.log('text-as-script endpoint was called and script may have executed.');";

  // middleware.ts で X-Content-Type-Options が設定されることを期待。
  // ここでは Content-Type を偽装するだけ。
  return new NextResponse(scriptBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain', // 偽のContent-Type
    },
  });
}
