import { NextRequest, NextResponse } from 'next/server';

// Node型定義
interface ChordNode {
  id: number;
  address: string;
  data: Record<string, any>;
  fingerTable: number[];
  successor: number | null;
  predecessor: number | null;
  joinedAt: string;
}

// グローバル型拡張
declare global {
  var chordNodes: Map<number, ChordNode> | undefined;
}

// シミュレーション用のインメモリデータ
let chordRing: any = null;
let nodeCounter = 0;

// グローバル状態の取得・設定
const getNodes = (): Map<number, ChordNode> => {
  if (!globalThis.chordNodes) {
    globalThis.chordNodes = new Map();
  }
  return globalThis.chordNodes;
};

const setNodes = (nodes: Map<number, ChordNode>) => {
  globalThis.chordNodes = nodes;
};

// リング状態を取得
export async function GET() {
  try {
    const nodes = getNodes();

    const ringInfo = {
      nodes: Array.from(nodes.values()).map(node => ({
        id: node.id,
        address: node.address,
        isAlive: true,
        dataCount: node.data ? Object.keys(node.data).length : 0,
        fingerTable: node.fingerTable || [],
        successor: node.successor || null,
        predecessor: node.predecessor || null
      })),
      totalNodes: nodes.size,
      totalData: Array.from(nodes.values()).reduce((sum, node) =>
        sum + (node.data ? Object.keys(node.data).length : 0), 0),
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json(ringInfo);
  } catch (error) {
    console.error('Error getting ring info:', error);
    return NextResponse.json(
      { error: 'Failed to get ring information' },
      { status: 500 }
    );
  }
}

// ノードを追加
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    const nodes = getNodes();
    const nodeId = nodeCounter++;
    const newNode: ChordNode = {
      id: nodeId,
      address: address,
      data: {},
      fingerTable: [],
      successor: null,
      predecessor: null,
      joinedAt: new Date().toISOString()
    };

    // 簡単なリング構築ロジック
    if (nodes.size === 0) {
      // 最初のノード
      newNode.successor = nodeId;
      newNode.predecessor = nodeId;
      for (let i = 0; i < 8; i++) {
        newNode.fingerTable.push(nodeId);
      }
    } else {
      // 既存のノードに接続
      const existingNodes = Array.from(nodes.values());
      const randomExisting = existingNodes[Math.floor(Math.random() * existingNodes.length)];

      newNode.successor = randomExisting.id;
      newNode.predecessor = randomExisting.id;

      // 簡単なフィンガーテーブル初期化
      for (let i = 0; i < 8; i++) {
        newNode.fingerTable.push(randomExisting.id);
      }
    }

    nodes.set(nodeId, newNode);
    setNodes(nodes);

    return NextResponse.json({
      message: 'Node added successfully',
      node: newNode
    });
  } catch (error) {
    console.error('Error adding node:', error);
    return NextResponse.json(
      { error: 'Failed to add node' },
      { status: 500 }
    );
  }
}

// ノードを削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');

    if (!nodeId) {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    const nodeIdNum = parseInt(nodeId);
    const nodes = getNodes();

    if (!nodes.has(nodeIdNum)) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    nodes.delete(nodeIdNum);
    setNodes(nodes);

    return NextResponse.json({
      message: 'Node removed successfully',
      nodeId: nodeIdNum
    });
  } catch (error) {
    console.error('Error removing node:', error);
    return NextResponse.json(
      { error: 'Failed to remove node' },
      { status: 500 }
    );
  }
}
