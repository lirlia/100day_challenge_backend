import { createHash } from 'crypto';
import { Node } from './types';

/**
 * 一貫性ハッシュリングの実装
 *
 * キーの分散やノードの追加・削除時の再配置を最小限にするためのデータ構造
 */
export class HashRing {
  /** ハッシュ空間上のノードの位置を保持する配列 */
  private ring: { position: number; nodeId: string }[] = [];
  /** ノードIDからノード情報へのマッピング */
  private nodes: Map<string, Node> = new Map();
  /** 各物理ノードの仮想ノード数（レプリカ数） */
  private readonly replicas: number;

  /**
   * HashRingを初期化
   * @param nodes 初期ノード配列
   * @param replicas 仮想ノード数（デフォルト: 100）
   */
  constructor(nodes: Node[] = [], replicas = 100) {
    this.replicas = replicas;
    for (const node of nodes) {
      this.addNode(node);
    }
  }

  /**
   * 新しいノードをリングに追加
   * @param node 追加するノード情報
   */
  addNode(node: Node): void {
    if (node.status !== 'active') {
      return; // アクティブでないノードは追加しない
    }

    this.nodes.set(node.id, node);

    // ノードの重み (weight) に基づいて仮想ノードを配置
    const actualReplicas = Math.max(1, Math.floor((this.replicas * node.weight) / 100));

    for (let i = 0; i < actualReplicas; i++) {
      const key = `${node.id}:${i}`;
      const position = this.hashToPosition(key);
      this.ring.push({ position, nodeId: node.id });
    }

    // ポジションでソート
    this.ring.sort((a, b) => a.position - b.position);
  }

  /**
   * リングからノードを削除
   * @param nodeId 削除するノードID
   */
  removeNode(nodeId: string): void {
    this.nodes.delete(nodeId);
    this.ring = this.ring.filter((item) => item.nodeId !== nodeId);
  }

  /**
   * キーに対応するノードを見つける
   * @param key キャッシュキー
   * @returns ノード情報、見つからない場合はundefined
   */
  getNode(key: string): Node | undefined {
    if (this.ring.length === 0) {
      return undefined;
    }

    const position = this.hashToPosition(key);
    const node = this.findNodeForPosition(position);

    return node ? this.nodes.get(node.nodeId) : undefined;
  }

  /**
   * キーに対するレプリカノードを取得
   * @param key キャッシュキー
   * @param count 取得するレプリカ数
   * @returns レプリカノードの配列
   */
  getReplicaNodes(key: string, count = 2): Node[] {
    if (this.ring.length === 0 || count <= 0) {
      return [];
    }

    const primaryNodeId = this.getNode(key)?.id;
    if (!primaryNodeId) {
      return [];
    }

    const uniqueNodeIds = new Set<string>([primaryNodeId]);
    const replicaNodes: Node[] = [];

    // リング内のプライマリノードの次のノードからレプリカを選択
    const position = this.hashToPosition(key);
    let idx = this.findClosestNodeIndex(position);

    while (uniqueNodeIds.size <= count && uniqueNodeIds.size < this.nodes.size) {
      idx = (idx + 1) % this.ring.length;
      const nodeId = this.ring[idx].nodeId;

      if (!uniqueNodeIds.has(nodeId)) {
        uniqueNodeIds.add(nodeId);
        const node = this.nodes.get(nodeId);
        if (node && node.status === 'active') {
          replicaNodes.push(node);
          if (replicaNodes.length >= count) {
            break;
          }
        }
      }
    }

    return replicaNodes;
  }

  /**
   * 全てのアクティブノードを取得
   * @returns アクティブノードの配列
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values()).filter(node => node.status === 'active');
  }

  /**
   * ノードの状態を更新
   * @param nodeId 更新するノードID
   * @param node 新しいノード情報
   */
  updateNode(nodeId: string, node: Node): void {
    const existingNode = this.nodes.get(nodeId);

    if (!existingNode) {
      return;
    }

    // ノードが無効になった場合はリングから削除
    if (node.status !== 'active' && existingNode.status === 'active') {
      this.removeNode(nodeId);
      this.nodes.set(nodeId, node);
      return;
    }

    // ノードが有効になった場合はリングに追加
    if (node.status === 'active' && existingNode.status !== 'active') {
      this.nodes.set(nodeId, node);
      this.addNode(node);
      return;
    }

    // 重みが変わった場合は再配置
    if (node.weight !== existingNode.weight) {
      this.removeNode(nodeId);
      this.nodes.set(nodeId, node);
      this.addNode(node);
      return;
    }

    // その他の更新
    this.nodes.set(nodeId, node);
  }

  /**
   * キーからハッシュ値（0-2^32の整数）を生成
   * @param key ハッシュ化するキー
   * @returns ハッシュ位置
   */
  private hashToPosition(key: string): number {
    const hash = createHash('md5').update(key).digest('hex');
    // 先頭8文字を取って整数に変換（0-2^32の範囲）
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * 指定位置に最も近いノードを取得
   * @param position ハッシュ位置
   * @returns ノード情報
   */
  private findNodeForPosition(position: number): { position: number; nodeId: string } | undefined {
    if (this.ring.length === 0) {
      return undefined;
    }

    const idx = this.findClosestNodeIndex(position);
    return this.ring[idx];
  }

  /**
   * 指定位置に最も近いノードのインデックスを取得
   * @param position ハッシュ位置
   * @returns リング内のインデックス
   */
  private findClosestNodeIndex(position: number): number {
    const ring = this.ring;
    const len = ring.length;

    // バイナリサーチで位置を探す
    let left = 0;
    let right = len - 1;

    if (position <= ring[0].position || position > ring[right].position) {
      return 0; // 端より小さい、または最大より大きい場合は先頭に
    }

    // 二分探索
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);

      if (position === ring[mid].position) {
        return mid;
      }

      if (position < ring[mid].position) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return left; // positionより大きい最初のノード
  }
}
