import { NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { V1Pod } from '@kubernetes/client-node';

// SSE ストリーム生成 (Namespace Pod Watch)
function createPodSSEStreamForNamespace(watch: k8s.Watch, namespace: string) {
    const stream = new ReadableStream({
        async start(controller) {
            console.log(`[Pod SSE Stream - NS: ${namespace}] Starting watch`);
            const abortController = new AbortController();
            const signal = abortController.signal;
            let aborted = false;
            signal.addEventListener('abort', () => {
                aborted = true;
                 console.log(`[Pod SSE Stream - NS: ${namespace}] Abort signal received.`);
             });

            let req: any | undefined;
            try {
                req = await watch.watch(
                    `/api/v1/namespaces/${namespace}/pods`,
                    { allowWatchBookmarks: true },
                    (type, apiObj, watchObj) => {
                        if (aborted) return;
                        console.log(`[Pod SSE Stream - NS: ${namespace}] Event: ${type}`, apiObj?.metadata?.name);

                        if (type === 'BOOKMARK') return;
                        if (type === 'ERROR' || !apiObj) {
                            console.error(`[Pod SSE Stream - NS: ${namespace}] Watch error:`, watchObj || apiObj);
                            return;
                        }
                        try {
                             // ストリームが閉じていないか再確認
                             if (signal.aborted || aborted) {
                                 console.log(`[Pod SSE Stream - NS: ${namespace}] Stream closed before enqueue, skipping.`);
                                 return;
                             }
                            controller.enqueue(`data: ${JSON.stringify({ type, object: apiObj as V1Pod })}\n\n`);
                        } catch (e: any) {
                             if (signal.aborted || aborted) {
                                 // ストリームが既に閉じられている場合のエラーは無視
                                 console.warn(`[Pod SSE Stream - NS: ${namespace}] Attempted to enqueue on closed stream.`);
                             } else {
                                 console.error(`[Pod SSE Stream - NS: ${namespace}] Enqueue or Stringify error:`, e);
                                 // エラー発生時はストリームを閉じる
                                 aborted = true;
                                 controller.error(e);
                                 if(req) req.abort();
                             }
                        }
                    },
                    (err) => {
                         if (signal.aborted || aborted) {
                             console.log(`[Pod SSE Stream - NS: ${namespace}] Watch ended after client disconnect.`);
                             // Ensure the controller is closed if not already
                             try { controller.close(); } catch (_) {} // Ignore errors if already closed
                             return;
                         }
                        if (err) {
                            console.error(`[Pod SSE Stream - NS: ${namespace}] Watch ended with error:`, err);
                            controller.error(err);
                        } else {
                            console.log(`[Pod SSE Stream - NS: ${namespace}] Watch ended normally.`);
                            controller.close();
                        }
                    }
                );
                 console.log(`[Pod SSE Stream - NS: ${namespace}] Watch request initiated.`);
                 if (req && typeof req.abort === 'function') {
                     signal.addEventListener('abort', () => { if(!aborted) req.abort(); });
                 }
            } catch (err: any) {
                if (signal.aborted || err.name === 'AbortError') {
                     console.log(`[Pod SSE Stream - NS: ${namespace}] Watch initiation aborted.`);
                } else {
                     console.error(`[Pod SSE Stream - NS: ${namespace}] Failed to start watch:`, err);
                     controller.error(err);
                }
                 // Ensure controller is closed on error during start
                 try { controller.close(); } catch (_) {}
            }
        },
        cancel(reason) {
            console.log(`[Pod SSE Stream - NS: ${namespace}] Cancelled:`, reason);
             // Signal is handled in start now
        },
    });
    return stream;
}

interface NamespaceStreamParams {
    params: {
        namespace: string;
    };
}

export async function GET(request: Request, { params: awaitedParams }: NamespaceStreamParams) {
    const params = await awaitedParams;
    const { namespace } = params;
    console.log(`[Pod SSE API] Request for namespace: ${namespace}`);

    if (!namespace) {
        return NextResponse.json({ error: 'Missing namespace' }, { status: 400 });
    }

    try {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const watch = new k8s.Watch(kc);
        const stream = createPodSSEStreamForNamespace(watch, namespace);

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });
    } catch (error: any) {
        console.error(`[Pod SSE API - NS: ${namespace}] Error:`, error);
        return NextResponse.json({ error: 'Failed stream', details: error.message }, { status: 500 });
    }
}
