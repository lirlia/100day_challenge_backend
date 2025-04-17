import { emitter } from '@/lib/emitter';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Ensure dynamic execution for SSE

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      const handleNewPost = (post: any) => {
        // SSE format: "event: <event_name>\ndata: <json_data>\n\n"
        controller.enqueue(`event: newPost\ndata: ${JSON.stringify(post)}\n\n`);
      };

      // 'newPost' イベントをリッスン
      emitter.on('newPost', handleNewPost);

      // クライアントが切断したときのクリーンアップ
      request.signal.onabort = () => {
        console.log('SSE client disconnected');
        emitter.off('newPost', handleNewPost);
        controller.close();
      };
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
