import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/nodes - 全ノードの情報を取得
 */
export async function GET() {
  try {
    console.log('📡 ノード一覧取得リクエスト');

    const nodes = db.prepare(`
      SELECT * FROM nodes
      ORDER BY created_at ASC
    `).all();

    console.log(`✅ ${nodes.length}個のノードを取得`);

    return NextResponse.json({
      success: true,
      nodes,
      count: nodes.length
    });

  } catch (error) {
    console.error('❌ ノード一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ノード一覧の取得に失敗しました'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nodes - 新しいノードを作成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name } = body;

    console.log('📡 ノード作成リクエスト:', { id, name });

    if (!id || !name) {
      return NextResponse.json(
        {
          success: false,
          error: 'id と name は必須です'
        },
        { status: 400 }
      );
    }

    // ノードを作成
    const insertNode = db.prepare(`
      INSERT INTO nodes (id, name, status)
      VALUES (?, ?, 'online')
    `);

    insertNode.run(id, name);

        // 既存ノードとの初期ネットワーク接続を作成
    const existingNodes = db.prepare(`
      SELECT id FROM nodes WHERE id != ?
    `).all(id) as Array<{ id: string }>;

    const insertConnection = db.prepare(`
      INSERT OR IGNORE INTO network_state (from_node, to_node, status)
      VALUES (?, ?, 'connected')
    `);

    // 双方向接続を作成
    for (const existingNode of existingNodes) {
      insertConnection.run(id, existingNode.id);
      insertConnection.run(existingNode.id, id);
    }

    // 作成されたノードを取得
    const newNode = db.prepare(`
      SELECT * FROM nodes WHERE id = ?
    `).get(id);

    console.log(`✅ ノード作成完了: ${id}`);

    return NextResponse.json({
      success: true,
      node: newNode
    });

  } catch (error: any) {
    console.error('❌ ノード作成エラー:', error);

    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return NextResponse.json(
        {
          success: false,
          error: '指定されたIDのノードは既に存在します'
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'ノードの作成に失敗しました'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/nodes - ノードの状態を更新
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { nodeId, status } = body;

    console.log('📡 ノード状態更新リクエスト:', { nodeId, status });

    if (!nodeId || !status) {
      return NextResponse.json(
        {
          success: false,
          error: 'nodeId と status は必須です'
        },
        { status: 400 }
      );
    }

    const validStatuses = ['online', 'offline', 'partitioned'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `有効な状態: ${validStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // ノード状態を更新
    const updateNode = db.prepare(`
      UPDATE nodes
      SET status = ?, last_seen = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = updateNode.run(status, nodeId);

    if (result.changes === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '指定されたノードが見つかりません'
        },
        { status: 404 }
      );
    }

    // 更新されたノードを取得
    const updatedNode = db.prepare(`
      SELECT * FROM nodes WHERE id = ?
    `).get(nodeId);

    console.log(`✅ ノード状態更新完了: ${nodeId} -> ${status}`);

    return NextResponse.json({
      success: true,
      node: updatedNode
    });

  } catch (error) {
    console.error('❌ ノード状態更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ノード状態の更新に失敗しました'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nodes - ノードを削除
 */
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get('nodeId');

    console.log('📡 ノード削除リクエスト:', { nodeId });

    if (!nodeId) {
      return NextResponse.json(
        {
          success: false,
          error: 'nodeId は必須です'
        },
        { status: 400 }
      );
    }

    // トランザクション内で関連データも削除
    const deleteNode = db.transaction(() => {
      // ネットワーク接続を削除
      db.prepare(`
        DELETE FROM network_state
        WHERE from_node = ? OR to_node = ?
      `).run(nodeId, nodeId);

      // CRDT操作履歴を削除
      db.prepare(`
        DELETE FROM crdt_operations
        WHERE node_id = ?
      `).run(nodeId);

      // CRDTスナップショットを削除
      db.prepare(`
        DELETE FROM crdt_snapshots
        WHERE node_id = ?
      `).run(nodeId);

      // ノードを削除
      const result = db.prepare(`
        DELETE FROM nodes WHERE id = ?
      `).run(nodeId);

      return result;
    });

    const result = deleteNode();

    if (result.changes === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '指定されたノードが見つかりません'
        },
        { status: 404 }
      );
    }

    console.log(`✅ ノード削除完了: ${nodeId}`);

    return NextResponse.json({
      success: true,
      message: `ノード ${nodeId} を削除しました`
    });

  } catch (error) {
    console.error('❌ ノード削除エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'ノードの削除に失敗しました'
      },
      { status: 500 }
    );
  }
}
