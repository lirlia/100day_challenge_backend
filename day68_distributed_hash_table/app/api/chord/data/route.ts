import { NextRequest, NextResponse } from 'next/server';

// グローバル型拡張
declare global {
  var chordNodes: Map<number, any> | undefined;
}

// 外部ファイルからノードデータにアクセス（シミュレーション）
// 実際の実装では、Goバックエンドと連携する
const getNodes = (): Map<number, any> => {
  // グローバル変数をシミュレート（実際はGoバックエンドから取得）
  return globalThis.chordNodes || new Map();
};

const setNodes = (nodes: Map<number, any>) => {
  globalThis.chordNodes = nodes;
};

// ハッシュ関数（簡易版）
const hashKey = (key: string): number => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  return Math.abs(hash) % 256; // 8bit空間
};

// 責任ノードを見つける
const findResponsibleNode = (keyHash: number): number | null => {
  const nodes = getNodes();
  if (nodes.size === 0) return null;

  const nodeIds = Array.from(nodes.keys()).sort((a, b) => a - b);

  // keyHashより大きい最小のノードIDを見つける
  for (const nodeId of nodeIds) {
    if (nodeId >= keyHash) {
      return nodeId;
    }
  }

  // 見つからない場合は最小のノードが責任を持つ（リング構造）
  return nodeIds[0];
};

// データを取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    const keyHash = hashKey(key);
    const responsibleNodeId = findResponsibleNode(keyHash);

    if (responsibleNodeId === null) {
      return NextResponse.json(
        { error: 'No nodes available' },
        { status: 503 }
      );
    }

    const nodes = getNodes();
    const node = nodes.get(responsibleNodeId);

    if (!node) {
      return NextResponse.json(
        { error: 'Responsible node not found' },
        { status: 404 }
      );
    }

    const value = node.data[key] || null;

    return NextResponse.json({
      key,
      value,
      keyHash,
      responsibleNodeId,
      found: value !== null
    });
  } catch (error) {
    console.error('Error getting data:', error);
    return NextResponse.json(
      { error: 'Failed to get data' },
      { status: 500 }
    );
  }
}

// データを保存
export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    const keyHash = hashKey(key);
    const responsibleNodeId = findResponsibleNode(keyHash);

    if (responsibleNodeId === null) {
      return NextResponse.json(
        { error: 'No nodes available' },
        { status: 503 }
      );
    }

    const nodes = getNodes();
    const node = nodes.get(responsibleNodeId);

    if (!node) {
      return NextResponse.json(
        { error: 'Responsible node not found' },
        { status: 404 }
      );
    }

    // データを保存
    node.data[key] = value;
    nodes.set(responsibleNodeId, node);
    setNodes(nodes);

    return NextResponse.json({
      message: 'Data stored successfully',
      key,
      value,
      keyHash,
      responsibleNodeId
    });
  } catch (error) {
    console.error('Error storing data:', error);
    return NextResponse.json(
      { error: 'Failed to store data' },
      { status: 500 }
    );
  }
}

// データを削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { error: 'Key is required' },
        { status: 400 }
      );
    }

    const keyHash = hashKey(key);
    const responsibleNodeId = findResponsibleNode(keyHash);

    if (responsibleNodeId === null) {
      return NextResponse.json(
        { error: 'No nodes available' },
        { status: 503 }
      );
    }

    const nodes = getNodes();
    const node = nodes.get(responsibleNodeId);

    if (!node) {
      return NextResponse.json(
        { error: 'Responsible node not found' },
        { status: 404 }
      );
    }

    const existed = key in node.data;
    delete node.data[key];
    nodes.set(responsibleNodeId, node);
    setNodes(nodes);

    return NextResponse.json({
      message: existed ? 'Data deleted successfully' : 'Key not found',
      key,
      keyHash,
      responsibleNodeId,
      existed
    });
  } catch (error) {
    console.error('Error deleting data:', error);
    return NextResponse.json(
      { error: 'Failed to delete data' },
      { status: 500 }
    );
  }
}
