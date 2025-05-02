import { NextResponse } from 'next/server';
import { k8sCoreV1Api } from '@/lib/k8s';
import { V1Pod, V1Status } from '@kubernetes/client-node';

interface PodListParams {
    params: {
        namespace: string;
        showName: string;
    };
}

export async function GET(request: Request, { params: awaitedParams }: PodListParams) {
    const params = await awaitedParams;
    const { namespace, showName } = params;

    if (!namespace || !showName) {
        return NextResponse.json(
            { error: 'Missing namespace or showName parameter' },
            { status: 400 }
        );
    }

    const labelSelector = `fireworks-show=${showName}`;

    try {
        console.log(`Fetching Pods for show '${showName}' in namespace '${namespace}' with selector '${labelSelector}'`);

        // 引数をオブジェクト形式に変更
        const response = await k8sCoreV1Api.listNamespacedPod({
            namespace: namespace,
            labelSelector: labelSelector,
            // 必要に応じて他のパラメータ (limit など) も追加可能
        });

        // response 自体から items を取得
        const pods = (response as any).items as V1Pod[]; // 型アサーションを追加
        console.log(`Found ${pods.length} pods for show '${showName}'`);

        // Podのリストを返す
        return NextResponse.json(pods);

    } catch (error: any) {
        console.error(`Error fetching pods for show '${showName}':`, error);
        // listNamespacedPod のエラーは body プロパティを持たない可能性があるため、直接エラーオブジェクトを見る
        const status: V1Status = error.body || { // error.body が存在する場合 (APIサーバーからのエラー) も考慮
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            message: error.message || `Unknown error fetching pods for ${showName}`,
            code: error.statusCode || 500, // statusCode も body にあることが多い
        };
        return NextResponse.json(
            { error: status.message, details: status },
            { status: status.code }
        );
    }
}
