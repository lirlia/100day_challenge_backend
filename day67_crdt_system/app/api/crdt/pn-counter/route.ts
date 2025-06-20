import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { PNCounterState } from '@/lib/types';

/**
 * GET /api/crdt/pn-counter
 * PN-Counter一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');

    console.log(`[PN-Counter API] GET request - nodeId: ${nodeId}`);
    let pnCounterRecords;

    if (nodeId) {
      // 特定ノードのPN-Counterを取得
      pnCounterRecords = db.prepare(`
        SELECT * FROM crdt_snapshots
        WHERE crdt_type = 'pn_counter' AND node_id = ?
        ORDER BY updated_at DESC
      `).all(nodeId);
    } else {
      // 全PN-Counterを取得
      pnCounterRecords = db.prepare(`
        SELECT * FROM crdt_snapshots
        WHERE crdt_type = 'pn_counter'
        ORDER BY updated_at DESC
      `).all();
    }

    const pnCounterList = pnCounterRecords.map((record: any) => {
      const state = JSON.parse(record.state);
      const vectorClock = JSON.parse(record.vector_clock);

      // 現在値を計算 (positive - negative)
      const positiveSum = Object.values(state.positive || {}).reduce((sum: number, count: any) => sum + count, 0);
      const negativeSum = Object.values(state.negative || {}).reduce((sum: number, count: any) => sum + count, 0);
      const currentValue = positiveSum - negativeSum;

      return {
        id: record.crdt_id,
        nodeId: record.node_id,
        currentValue,
        positiveSum,
        negativeSum,
        state,
        vectorClock,
        lastModified: record.updated_at
      };
    });

    return NextResponse.json({
      success: true,
      data: pnCounterList,
      total: pnCounterList.length
    });

  } catch (error) {
    console.error('[PN-Counter API] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'PN-Counter取得に失敗しました'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crdt/pn-counter
 * PN-Counterの作成、インクリメント、デクリメント操作
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, counterId, nodeId, amount = 1 } = body;

    console.log(`[PN-Counter API] POST request - action: ${action}, counterId: ${counterId}, nodeId: ${nodeId}, amount: ${amount}`);

    if (!action || !nodeId) {
      return NextResponse.json(
        { success: false, error: 'action と nodeId は必須です' },
        { status: 400 }
      );
    }


    let isNew = false;
    const actualCounterId = counterId || `pn_counter_${nodeId}_${Date.now()}`;

    // 既存データを取得または初期化
    let currentState: PNCounterState = {
      positive: {},
      negative: {}
    };

    const existingRecord = db.prepare(`
      SELECT * FROM crdt_snapshots
      WHERE crdt_id = ? AND crdt_type = 'pn_counter'
      ORDER BY updated_at DESC LIMIT 1
    `).get(actualCounterId) as any;

    if (existingRecord) {
      currentState = JSON.parse(existingRecord.state);
    } else {
      isNew = true;
    }

    // 現在の値を計算
    const oldPositiveSum = Object.values(currentState.positive || {}).reduce((sum: number, count: any) => sum + count, 0);
    const oldNegativeSum = Object.values(currentState.negative || {}).reduce((sum: number, count: any) => sum + count, 0);
    const oldValue = oldPositiveSum - oldNegativeSum;

    // 操作を実行
    let newState = { ...currentState };
    if (!newState.positive) newState.positive = {};
    if (!newState.negative) newState.negative = {};

    switch (action) {
      case 'create':
        // 作成のみの場合は現在の状態を保持
        break;

      case 'increment':
        if (amount <= 0) {
          return NextResponse.json(
            { success: false, error: 'インクリメント量は正の値である必要があります' },
            { status: 400 }
          );
        }
        newState.positive[nodeId] = (newState.positive[nodeId] || 0) + amount;
        break;

      case 'decrement':
        if (amount <= 0) {
          return NextResponse.json(
            { success: false, error: 'デクリメント量は正の値である必要があります' },
            { status: 400 }
          );
        }
        newState.negative[nodeId] = (newState.negative[nodeId] || 0) + amount;
        break;

      default:
        return NextResponse.json(
          { success: false, error: `不正なアクション: ${action}` },
          { status: 400 }
        );
    }

    // 新しい値を計算
    const newPositiveSum = Object.values(newState.positive).reduce((sum: number, count: any) => sum + count, 0);
    const newNegativeSum = Object.values(newState.negative).reduce((sum: number, count: any) => sum + count, 0);
    const newValue = newPositiveSum - newNegativeSum;

    // ベクタークロックを更新
    let vectorClock: any = {};
    if (existingRecord) {
      vectorClock = JSON.parse(existingRecord.vector_clock);
    }
    vectorClock[nodeId] = (vectorClock[nodeId] || 0) + 1;

    const now = new Date().toISOString();

    // 操作をデータベースに記録
    if (action !== 'create') {
      db.prepare(`
        INSERT INTO crdt_operations (
          id, node_id, crdt_type, crdt_id, operation_type, operation_data,
          vector_clock, timestamp, applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${actualCounterId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        nodeId,
        'pn_counter',
        actualCounterId,
        action,
        JSON.stringify({ amount }),
        JSON.stringify(vectorClock),
        now,
        1
      );
    }

    // スナップショットを更新
    if (existingRecord) {
      db.prepare(`
        UPDATE crdt_snapshots
        SET state = ?, vector_clock = ?, updated_at = ?
        WHERE crdt_id = ? AND crdt_type = 'pn_counter'
      `).run(
        JSON.stringify(newState),
        JSON.stringify(vectorClock),
        now,
        actualCounterId
      );
    } else {
      db.prepare(`
        INSERT INTO crdt_snapshots (
          id, node_id, crdt_type, crdt_id, state, vector_clock, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `snapshot_${actualCounterId}_${Date.now()}`,
        nodeId,
        'pn_counter',
        actualCounterId,
        JSON.stringify(newState),
        JSON.stringify(vectorClock),
        now
      );
    }

    console.log(`[PN-Counter API] Operation completed - ${action}: ${oldValue} -> ${newValue}`);

    return NextResponse.json({
      success: true,
      data: {
        id: actualCounterId,
        nodeId,
        action,
        oldValue,
        newValue,
        amount,
        positiveSum: newPositiveSum,
        negativeSum: newNegativeSum,
        state: newState,
        vectorClock,
        isNew
      }
    });

  } catch (error) {
    console.error('[PN-Counter API] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'PN-Counter操作に失敗しました'
      },
      { status: 500 }
    );
  }
}
