import { NextResponse } from 'next/server';
import { simulation } from '../../../../../lib/raft/simulation';
import { z } from 'zod';

interface RouteContext {
  params: {
    id: string;
  };
}

// Zod スキーマ定義 (バリデーション用)
const updatePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// POST: ノードの状態をトグル (実行中/停止中)
export async function POST(request: Request, context: RouteContext) {
    // Next.js 15+ では await context.params が必要になる可能性がある
    const params = await context.params;
    const { id } = params;

    try {
      const nodeId = parseInt(id, 10);
      if (isNaN(nodeId)) {
        return NextResponse.json({ error: 'Invalid node ID' }, { status: 400 });
      }
      simulation.toggleNode(nodeId); // Simulation クラスに toggleNode メソッドが必要
      const state = simulation.getState(); // 最新の状態を返す
      return NextResponse.json(state);
    } catch (error) {
      console.error(`Error toggling node ${id}:`, error);
      return NextResponse.json({ error: `Failed to toggle node ${id}` }, { status: 500 });
    }
}

// PUT: ノードの位置を更新
export async function PUT(request: Request, context: RouteContext) {
    const params = await context.params;
    const { id } = params;

    try {
        const nodeId = parseInt(id, 10);
        if (isNaN(nodeId)) {
            return NextResponse.json({ error: 'Invalid node ID' }, { status: 400 });
        }

        const body = await request.json();
        const validation = updatePositionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request body', details: validation.error.errors }, { status: 400 });
        }

        const { x, y } = validation.data;

        simulation.updateNodePosition(nodeId, x, y); // Simulation クラスに updateNodePosition メソッドが必要
        // 位置更新は状態全体を返す必要はないかもしれないが、一旦返す
        const state = simulation.getState();
        return NextResponse.json(state);

    } catch (error) {
        console.error(`Error updating node ${id} position:`, error);
        return NextResponse.json({ error: `Failed to update node ${id} position` }, { status: 500 });
    }
}
