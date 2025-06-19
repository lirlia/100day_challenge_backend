import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PNCounter } from '@/app/_lib/crdt/pn-counter'
import type { PNCounterState } from '@/lib/types'

/**
 * PN-Counter取得API
 *
 * GET /api/crdt/pn-counter
 * - 全てのPN-Counterを取得
 *
 * GET /api/crdt/pn-counter?crdtId=xxx
 * - 特定のPN-Counterを取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const crdtId = searchParams.get('crdtId')

    if (crdtId) {
      // 特定のPN-Counter取得
      console.log(`📊 PN-Counter取得: ${crdtId}`)

      // 操作履歴から状態を復元
      const operations = db.prepare(`
        SELECT * FROM crdt_operations
        WHERE crdt_type = ? AND crdt_id = ?
        ORDER BY timestamp ASC
      `).all('pn_counter', crdtId) as Array<{
        id: string
        node_id: string
        operation_type: string
        operation_data: string
        vector_clock: string
        timestamp: string
      }>

      // 各ノード別にPN-Counterを復元
      const nodeCounters = new Map<string, PNCounter>()

      for (const op of operations) {
        const nodeId = op.node_id

        if (!nodeCounters.has(nodeId)) {
          nodeCounters.set(nodeId, new PNCounter(nodeId, crdtId))
        }

        const counter = nodeCounters.get(nodeId)!
        const operationData = JSON.parse(op.operation_data)

        if (op.operation_type === 'increment') {
          counter.increment(operationData.value || 1)
        } else if (op.operation_type === 'decrement') {
          counter.increment(operationData.value || 1)
        }
      }

      // 最新スナップショットから復元
      const snapshots = db.prepare(`
        SELECT * FROM crdt_snapshots
        WHERE crdt_type = ? AND crdt_id = ?
        ORDER BY updated_at DESC
      `).all('pn_counter', crdtId) as Array<{
        node_id: string
        state: string
        vector_clock: string
      }>

      let mergedCounter: PNCounter | null = null

      if (snapshots.length > 0) {
        // スナップショットから復元
        for (const snapshot of snapshots) {
          const state = JSON.parse(snapshot.state) as PNCounterState
          const counter = new PNCounter(snapshot.node_id, crdtId, state)

          if (!mergedCounter) {
            mergedCounter = counter
          } else {
            mergedCounter.merge(counter)
          }
        }
      } else if (nodeCounters.size > 0) {
        // 操作履歴から復元
        const [firstCounter, ...restCounters] = Array.from(nodeCounters.values())
        mergedCounter = firstCounter

        for (const counter of restCounters) {
          mergedCounter.merge(counter)
        }
      }

      if (!mergedCounter) {
        return NextResponse.json({
          error: 'PN-Counter not found'
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        data: {
          crdtId,
          type: 'pn_counter',
          value: mergedCounter.getValue(),
          state: mergedCounter.getState(),
          nodeDetails: mergedCounter.getNodeDetails(),
          vectorClock: mergedCounter.getVectorClock(),
          debugInfo: mergedCounter.getDebugInfo()
        }
      })
    } else {
      // 全PN-Counter一覧取得
      console.log('📊 全PN-Counter一覧取得')

      const snapshots = db.prepare(`
        SELECT DISTINCT crdt_id FROM crdt_snapshots
        WHERE crdt_type = ?
        ORDER BY updated_at DESC
      `).all('pn_counter') as Array<{ crdt_id: string }>

      const counters = []

      for (const snapshot of snapshots) {
        // 再帰的にGETを呼び出すのではなく、直接処理
        const nodeSnapshots = db.prepare(`
          SELECT * FROM crdt_snapshots
          WHERE crdt_type = ? AND crdt_id = ?
          ORDER BY updated_at DESC
        `).all('pn_counter', snapshot.crdt_id) as Array<{
          node_id: string
          state: string
          vector_clock: string
        }>

        let mergedCounter: PNCounter | null = null

        for (const snap of nodeSnapshots) {
          const state = JSON.parse(snap.state) as PNCounterState
          const counter = new PNCounter(snap.node_id, snapshot.crdt_id, state)

          if (!mergedCounter) {
            mergedCounter = counter
          } else {
            mergedCounter.merge(counter)
          }
        }

        if (mergedCounter) {
          counters.push({
            crdtId: snapshot.crdt_id,
            type: 'pn_counter',
            value: mergedCounter.getValue(),
            nodeCount: Object.keys(mergedCounter.getNodeDetails()).length,
            lastUpdated: nodeSnapshots[0]?.vector_clock || 'unknown'
          })
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          counters,
          total: counters.length
        }
      })
    }
  } catch (error) {
    console.error('PN-Counter取得エラー:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

/**
 * PN-Counter操作API
 *
 * POST /api/crdt/pn-counter
 * Body: {
 *   action: 'create' | 'increment' | 'decrement'
 *   crdtId: string
 *   nodeId: string
 *   value?: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, crdtId, nodeId, value = 1 } = body

    console.log(`🔧 PN-Counter操作: ${action} - Node: ${nodeId}, CRDT: ${crdtId}, Value: ${value}`)

    if (!action || !crdtId || !nodeId) {
      return NextResponse.json({
        error: 'Missing required fields: action, crdtId, nodeId'
      }, { status: 400 })
    }

    if (action === 'create') {
      // 新しいPN-Counter作成
      const counter = new PNCounter(nodeId, crdtId)

      // 初期スナップショット保存
      const snapshot = {
        id: `snapshot_${crdtId}_${nodeId}_${Date.now()}`,
        node_id: nodeId,
        crdt_type: 'pn_counter',
        crdt_id: crdtId,
        state: counter.serialize(),
        vector_clock: JSON.stringify(counter.getVectorClock()),
        updated_at: new Date().toISOString()
      }

      db.prepare(`
        INSERT INTO crdt_snapshots (
          id, node_id, crdt_type, crdt_id, state, vector_clock, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshot.id, snapshot.node_id, snapshot.crdt_type,
        snapshot.crdt_id, snapshot.state, snapshot.vector_clock, snapshot.updated_at
      )

      console.log(`✅ PN-Counter作成完了: ${crdtId}`)

      return NextResponse.json({
        success: true,
        data: {
          crdtId,
          type: 'pn_counter',
          value: counter.getValue(),
          state: counter.getState(),
          vectorClock: counter.getVectorClock()
        }
      })
    } else if (action === 'increment' || action === 'decrement') {
      // 既存PN-Counterの操作

      // 最新状態を取得
      const latestSnapshot = db.prepare(`
        SELECT state, vector_clock FROM crdt_snapshots
        WHERE crdt_type = ? AND crdt_id = ? AND node_id = ?
        ORDER BY updated_at DESC LIMIT 1
      `).get('pn_counter', crdtId, nodeId) as { state: string; vector_clock: string } | undefined

      let counter: PNCounter

      if (latestSnapshot) {
        const state = JSON.parse(latestSnapshot.state) as PNCounterState
        counter = new PNCounter(nodeId, crdtId, state)
      } else {
        counter = new PNCounter(nodeId, crdtId)
      }

      // 操作実行
      if (action === 'increment') {
        counter.increment(value)
      } else {
        counter.decrement(value)
      }

      // 操作履歴を記録
      const operationRecord = {
        id: `op_${crdtId}_${nodeId}_${Date.now()}`,
        node_id: nodeId,
        crdt_type: 'pn_counter',
        crdt_id: crdtId,
        operation_type: action,
        operation_data: JSON.stringify({ value }),
        vector_clock: JSON.stringify(counter.getVectorClock()),
        timestamp: new Date().toISOString(),
        applied: true
      }

      db.prepare(`
        INSERT INTO crdt_operations (
          id, node_id, crdt_type, crdt_id, operation_type,
          operation_data, vector_clock, timestamp, applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        operationRecord.id, operationRecord.node_id, operationRecord.crdt_type,
        operationRecord.crdt_id, operationRecord.operation_type, operationRecord.operation_data,
        operationRecord.vector_clock, operationRecord.timestamp, operationRecord.applied
      )

      // 状態スナップショット更新
      const snapshotId = `snapshot_${crdtId}_${nodeId}_${Date.now()}`
      db.prepare(`
        INSERT INTO crdt_snapshots (
          id, node_id, crdt_type, crdt_id, state, vector_clock, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshotId, nodeId, 'pn_counter', crdtId, counter.serialize(),
        JSON.stringify(counter.getVectorClock()), new Date().toISOString()
      )

      console.log(`✅ PN-Counter ${action} 完了: ${crdtId} = ${counter.getValue()}`)

      return NextResponse.json({
        success: true,
        data: {
          crdtId,
          type: 'pn_counter',
          action,
          value: counter.getValue(),
          state: counter.getState(),
          nodeDetails: counter.getNodeDetails(),
          vectorClock: counter.getVectorClock(),
          operationId: operationRecord.id
        }
      })
    } else {
      return NextResponse.json({
        error: `Unknown action: ${action}`
      }, { status: 400 })
    }
  } catch (error) {
    console.error('PN-Counter操作エラー:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
