import { NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import {
    k8sCustomObjectsApi,
    fireworksGroup,
    fireworksVersion,
    fireworksPlural,
} from '@/lib/k8s';
import type { FireworksShow } from '../route'; // 型定義を再利用

// SSEストリームを生成する関数
function createSSEStream(watch: k8s.Watch) {
    const stream = new ReadableStream({
        async start(controller) {
            console.log('[SSE Stream] Starting FireworksShow watch');

            // AbortController を使ってリクエスト中断をハンドル
            const abortController = new AbortController();
            const signal = abortController.signal;

            // クライアント切断時にwatchを中断するためのフラグ
            let aborted = false;
            signal.addEventListener('abort', () => {
                console.log('[SSE Stream] Abort signal received, stopping watch.');
                aborted = true;
            });

            try {
                const req = await watch.watch(
                    `/apis/${fireworksGroup}/${fireworksVersion}/${fireworksPlural}`,
                    { allowWatchBookmarks: true }, // ブックマークを許可して再接続に対応しやすくする
                    // connect callback (イベント受信時)
                    (type, apiObj, watchObj) => {
                        if (aborted) {
                            console.log('[SSE Stream] Aborted by client, stopping watch.');
                             if (req) req.abort(); // 進行中のリクエストを中断
                            return;
                        }
                        console.log(`[SSE Stream] Event: ${type}`, apiObj ? apiObj.metadata?.name : 'N/A');

                        // BOOKMARK イベントは進行状況を示すだけで、実際のデータ変更ではないため無視
                        if (type === 'BOOKMARK') {
                           console.log('[SSE Stream] Received BOOKMARK event.');
                           return;
                        }
                        // ERROR イベント (通常は Status オブジェクト)
                        if (type === 'ERROR' || !apiObj) {
                            console.error('[SSE Stream] Watch error or null apiObj:', watchObj || apiObj);
                            // エラー内容によってはストリームを閉じるか、再試行ロジックを入れる
                            // controller.error(new Error('Watch error occurred'));
                            return;
                        }

                        const showData = apiObj as FireworksShow;
                        const dataToSend = { type, object: showData };
                        try {
                            const dataString = JSON.stringify(dataToSend);
                            controller.enqueue(`data: ${dataString}\n\n`);
                        } catch (e) {
                           console.error('[SSE Stream] Failed to stringify data:', e, dataToSend);
                        }
                    },
                    // done callback (watchが正常終了またはエラーで終了した時)
                    (err) => {
                        if (aborted) {
                           console.log('[SSE Stream] Watch ended because client disconnected.');
                           controller.close();
                           return;
                        }
                        if (err) {
                           console.error('[SSE Stream] Watch ended with error:', err);
                           // エラーの種類に応じて再接続を試みるか、ストリームを閉じる
                           // ここでは一旦閉じる
                           controller.error(err); // ストリームにエラーを通知
                        } else {
                           console.log('[SSE Stream] Watch ended normally (e.g., timeout, resource version too old). Reconnecting might be needed.');
                           // 通常終了の場合もストリームを閉じるか、再接続ロジックを起動
                           controller.close();
                        }
                    }
                );
                console.log('[SSE Stream] Watch request initiated.');

                // AbortControllerのsignalをリクエストに紐付け (request-promise依存)
                // reqがabort()メソッドを持つことを期待
                if (req && typeof req.abort === 'function') {
                   signal.addEventListener('abort', () => req.abort());
                }

            } catch (err: any) {
                if (signal.aborted || err.name === 'AbortError') {
                    console.log('[SSE Stream] Watch initiation aborted by client.');
                } else {
                    console.error('[SSE Stream] Failed to start watch:', err);
                    controller.error(err);
                }
            }
        },
        cancel(reason) {
            console.log('[SSE Stream] Stream cancelled by client:', reason);
            // start 内の abortController を使って中断するので、ここでは不要
            // abortController.abort(); // Ensure watch is stopped
        },
    });

    return stream;
}


export async function GET() {
    console.log('[SSE API] Received request for FireworksShow stream');
    try {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const watch = new k8s.Watch(kc);

        const stream = createSSEStream(watch);

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform', // no-transform を追加 (プロキシによるバッファリングを防ぐ)
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Nginx specific header to disable buffering
                // 'Content-Encoding': 'none', // 圧縮無効化 (環境による)
            },
        });
    } catch (error: any) {
        console.error('[SSE API] Error creating SSE stream:', error);
        return NextResponse.json(
            { error: 'Failed to create SSE stream', details: error.message },
            { status: 500 }
        );
    }
}
