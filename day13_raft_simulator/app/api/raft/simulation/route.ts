import { NextResponse } from 'next/server';
import { simulation } from '../../../../lib/raft/simulation';

// GET: 現在のシミュレーション状態を取得
export async function GET() {
  try {
    const state = simulation.getState(); // Simulation クラスに getState メソッドが必要
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error getting simulation state:", error);
    return NextResponse.json({ error: 'Failed to get simulation state' }, { status: 500 });
  }
}

// POST: シミュレーションを1ステップ進める
export async function POST() {
  try {
    simulation.tick(); // Simulation クラスに tick メソッドが必要
    const state = simulation.getState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("Error ticking simulation:", error);
    return NextResponse.json({ error: 'Failed to tick simulation' }, { status: 500 });
  }
}

// DELETE: シミュレーションをリセットする
export async function DELETE() {
    try {
      simulation.reset(); // Simulation クラスに reset メソッドが必要
      const state = simulation.getState();
      return NextResponse.json(state);
    } catch (error) {
      console.error("Error resetting simulation:", error);
      return NextResponse.json({ error: 'Failed to reset simulation' }, { status: 500 });
    }
  }
