import { NextResponse } from 'next/server';
import {
    k8sCustomObjectsApi,
    fireworksGroup,
    fireworksVersion,
    fireworksPlural,
} from '@/lib/k8s';
import { V1Status } from '@kubernetes/client-node';

// Kubernetesのカスタムオブジェクト（特にFireworksShow）の型定義（簡略版）
// 必要に応じてGoの型定義に合わせて拡張してください
export interface FireworksShow {
    apiVersion?: string;
    kind?: string;
    metadata: {
        name?: string;
        namespace?: string;
        uid?: string;
        creationTimestamp?: string;
        [key: string]: any; // 他のメタデータフィールドを許容
    };
    spec: {
        durationSeconds: number;
        intensity: number;
        podSpecTemplate?: any; // 実際にはPodSpecの型
    };
    status?: {
        phase?: 'Pending' | 'Running' | 'Completed' | 'Failed';
        startTime?: string;
        completionTime?: string;
        launchedPods?: number;
        activePods?: number;
        failedPods?: number;
        conditions?: any[]; // Condition型
    };
}

export async function GET() {
    try {
        console.log('Fetching FireworksShows...');
        const params = {
            group: fireworksGroup,
            version: fireworksVersion,
            plural: fireworksPlural,
        };
        console.log('API Call Params Object:', params);

        // 引数をオブジェクト形式に変更
        const response = await k8sCustomObjectsApi.listClusterCustomObject(params);

        // APIレスポンス全体をログに出力して確認 (構造を見るため stringify しない)
        console.log('API Response Object:', response);

        // response 自体に items プロパティがあるか確認
        const responseAsAny = response as any; // 型チェックを一時的に回避
        if (!responseAsAny || !responseAsAny.items) {
            console.error('Invalid API response structure or missing items property directly on response object:', response);
            throw new Error('Failed to retrieve valid FireworksShow items from API response.');
        }

        // response から直接 items を取得
        const shows = (responseAsAny as { items: FireworksShow[] }).items;
        console.log(`Found ${shows.length} FireworksShows`);
        return NextResponse.json(shows);

    } catch (error: any) {
        console.error('Error fetching FireworksShows:', error);
        const status: V1Status = error.body || {
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            message: error.message || 'Unknown error fetching FireworksShows',
            code: error.statusCode || 500,
        };

        return NextResponse.json(
            { error: status.message, details: status },
            { status: status.code }
        );
    }
}
