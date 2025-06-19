import { NextRequest, NextResponse } from 'next/server';
import { GCounter } from '@/app/_lib/crdt/g-counter';
import db from '@/lib/db';
import { nanoid } from 'nanoid';

/**
 * GET /api/crdt/g-counter - 全てのG-Counterを取得
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get('nodeId');

    console.log('📡 G-Counter一覧取得リクエスト:', { nodeId });

    let query = `
      SELECT DISTINCT crdt_id, demo_type, metadata, created_at
      FROM demo_data
      WHERE crdt_type = 'g_counter'
    `;

    const params: any[] = [];

        const crdts = db.prepare(query).all(...params) as Array<{
      crdt_id: string;
      demo_type: string;
      metadata: string | null;
      created_at: string;
    }>;

    // 各CRDTの最新状態を取得
    const results = [];

    for (const crdt of crdts) {
      try {
        // 指定されたノードまたはデフォルトノードでのCRDT状態を取得
        const targetNodeId = nodeId || 'node-alpha';

        const snapshot = db.prepare(`
          SELECT state, vector_clock, updated_at
          FROM crdt_snapshots
          WHERE crdt_type = 'g_counter' AND crdt_id = ? AND node_id = ?
          ORDER BY updated_at DESC
          LIMIT 1
        `).get(crdt.crdt_id, targetNodeId) as {
          state: string;
          vector_clock: string;
          updated_at: string;
        } | undefined;

        let counter: GCounter;

        if (snapshot) {
          // 既存の状態から復元
          counter = new GCounter(crdt.crdt_id, targetNodeId);
          counter.deserialize(snapshot.state);
        } else {
          // 新規作成
          counter = new GCounter(crdt.crdt_id, targetNodeId);
        }

        results.push({
          id: crdt.crdt_id,
          type: 'g_counter',
          demo_type: crdt.demo_type,
          metadata: crdt.metadata ? JSON.parse(crdt.metadata) : null,
          state: counter.getState(),
          value: counter.getValue(),
          node_details: counter.getNodeDetails(),
          vector_clock: counter.getVectorClock(),
          last_updated: snapshot?.updated_at || crdt.created_at
        });

      } catch (error) {
        console.error(`G-Counter ${crdt.crdt_id} の状態取得エラー:`, error);
      }
    }

    console.log(`✅ ${results.length}個のG-Counterを取得`);

    return NextResponse.json({
      success: true,
      crdts: results,
      count: results.length
    });

  } catch (error) {
    console.error('❌ G-Counter一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'G-Counter一覧の取得に失敗しました'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crdt/g-counter - 新しいG-Counterを作成または操作実行
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, crdtId, nodeId, amount, demoType, metadata } = body;

    console.log('📡 G-Counter操作リクエスト:', { action, crdtId, nodeId, amount });

    if (!action || !nodeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'action と nodeId は必須です'
        },
        { status: 400 }
      );
    }

    // ノードが存在するかチェック
    const node = db.prepare(`
      SELECT id FROM nodes WHERE id = ?
    `).get(nodeId);

    if (!node) {
      return NextResponse.json(
        {
          success: false,
          error: '指定されたノードが存在しません'
        },
        { status: 404 }
      );
    }

    if (action === 'create') {
      // 新しいG-Counterを作成
      const id = crdtId || nanoid();

      try {
        // デモデータを登録
        db.prepare(`
          INSERT INTO demo_data (id, demo_type, demo_id, crdt_type, crdt_id, metadata)
          VALUES (?, ?, ?, 'g_counter', ?, ?)
        `).run(nanoid(), demoType || 'counter', id, id, JSON.stringify(metadata || {}));

        // G-Counterインスタンスを作成
        const counter = new GCounter(id, nodeId);

                 // 初期状態をスナップショットとして保存
         db.prepare(`
           INSERT OR REPLACE INTO crdt_snapshots
           (id, node_id, crdt_type, crdt_id, state, vector_clock, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
         `).run(
           nanoid(),
           nodeId,
           'g_counter',
           id,
           counter.serialize(),
           JSON.stringify(counter.getVectorClock()),
           new Date().toISOString()
         );

        console.log(`✅ G-Counter作成完了: ${id}`);

        return NextResponse.json({
          success: true,
          crdt: {
            id,
            type: 'g_counter',
            state: counter.getState(),
            value: counter.getValue(),
            node_details: counter.getNodeDetails(),
            vector_clock: counter.getVectorClock()
          }
        });

      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return NextResponse.json(
            {
              success: false,
              error: '指定されたIDのCRDTは既に存在します'
            },
            { status: 409 }
          );
        }
        throw error;
      }

    } else if (action === 'increment') {
      // インクリメント操作
      if (!crdtId) {
        return NextResponse.json(
          {
            success: false,
            error: 'crdtId は必須です'
          },
          { status: 400 }
        );
      }

      const incrementAmount = amount || 1;

      if (incrementAmount <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'amount は正の値である必要があります'
          },
          { status: 400 }
        );
      }

             // 既存のG-Counterを取得または作成
       const snapshot = db.prepare(`
         SELECT state, vector_clock
         FROM crdt_snapshots
         WHERE crdt_type = 'g_counter' AND crdt_id = ? AND node_id = ?
         ORDER BY updated_at DESC
         LIMIT 1
       `).get(crdtId, nodeId) as {
         state: string;
         vector_clock: string;
       } | undefined;

       let counter: GCounter;

       if (snapshot) {
         counter = new GCounter(crdtId, nodeId);
         counter.deserialize(snapshot.state);
       } else {
         counter = new GCounter(crdtId, nodeId);
       }

      // インクリメント実行
      const result = counter.increment(incrementAmount);

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error
          },
          { status: 400 }
        );
      }

             // 操作履歴を記録
       db.prepare(`
         INSERT INTO crdt_operations
         (id, node_id, crdt_type, crdt_id, operation_type, operation_data, vector_clock, timestamp, applied)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)
       `).run(
         nanoid(),
         nodeId,
         'g_counter',
         crdtId,
         'increment',
         JSON.stringify({ amount: incrementAmount, nodeId, newValue: counter.getValue() }),
         JSON.stringify(counter.getVectorClock()),
         new Date().toISOString()
       );

             // 状態スナップショットを更新
       db.prepare(`
         INSERT OR REPLACE INTO crdt_snapshots
         (id, node_id, crdt_type, crdt_id, state, vector_clock, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       `).run(
         nanoid(),
         nodeId,
         'g_counter',
         crdtId,
         counter.serialize(),
         JSON.stringify(counter.getVectorClock()),
         new Date().toISOString()
       );

      console.log(`✅ G-Counter increment完了: ${crdtId} (+${incrementAmount})`);

      return NextResponse.json({
        success: true,
        operation: {
          type: 'increment',
          amount: incrementAmount,
          oldValue: result.oldState,
          newValue: result.newState
        },
        crdt: {
          id: crdtId,
          type: 'g_counter',
          state: counter.getState(),
          value: counter.getValue(),
          node_details: counter.getNodeDetails(),
          vector_clock: counter.getVectorClock()
        }
      });

    } else {
      return NextResponse.json(
        {
          success: false,
          error: `未対応のアクション: ${action}`
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('❌ G-Counter操作エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'G-Counter操作に失敗しました'
      },
      { status: 500 }
    );
  }
}
