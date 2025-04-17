import { NextRequest, NextResponse } from 'next/server';

// 接続中のクライアントを保持する Map (userId => ReadableStreamController)
const clients = new Map<string, ReadableStreamDefaultController>();

// クライアントにメッセージを送信するヘルパー関数
function sendMessage(userId: string, data: any) {
  const controller = clients.get(userId);
  if (controller) {
    console.log(`Sending message to ${userId}:`, data);
    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
  } else {
    console.warn(`Client ${userId} not found.`);
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');

  if (!userId) {
    return new NextResponse('User ID is required', { status: 400 });
  }

  if (clients.has(userId)) {
    console.warn(`User ID ${userId} already connected. Closing previous connection.`);
    try {
        clients.get(userId)?.close();
    } catch (e) {
        // すでに閉じられている場合など
        console.warn(`Error closing previous connection for ${userId}:`, e);
    }
    clients.delete(userId);
  }

  console.log(`Client connected: ${userId}`);

  const stream = new ReadableStream({
    start(controller) {
      clients.set(userId, controller);
      // 接続確認メッセージ
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    },
    cancel() {
      console.log(`Client disconnected: ${userId}`);
      clients.delete(userId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function POST(request: NextRequest) {
  const targetUserId = request.nextUrl.searchParams.get('targetUserId');

  // // デバッグ: 生のリクエストボディをログ出力
  // const rawBody = await request.text();
  // console.log('Raw request body:', rawBody);

  // let message:
  //   any;
  // try {
  //     message = JSON.parse(rawBody);
  // } catch (error) {
  //     console.error('Error parsing JSON:', error);
  //     // エラー発生時も 500 ではなく、問題を示すレスポンスを返す
  //     return new NextResponse('Invalid JSON format in request body', { status: 400 });
  // }
  const message = await request.json(); // 元のコードに戻す

  if (!targetUserId) {
    return new NextResponse('Target User ID is required', { status: 400 });
  }

  console.log(`Received message for ${targetUserId} from ${message?.senderId || 'unknown'}:`, message);

  if (clients.has(targetUserId)) {
    sendMessage(targetUserId, message);
    return new NextResponse('Message sent', { status: 200 });
  } else {
    console.error(`Target user ${targetUserId} not found`);
    // 相手が見つからない場合でも 200 OK を返す (クライアント側で再試行などを制御しやすくするため)
    // エラーにする場合は 404 Not Found など
    return new NextResponse(`Target user ${targetUserId} not connected`, { status: 200 });
  }
}
