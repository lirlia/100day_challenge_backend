import { RaftNode } from './Node';
import { RaftNodeInfo, RaftMessage, SimulationEvent, LogEntry } from './types';

// 最小/最大選挙タイムアウト (ms)
const MIN_ELECTION_TIMEOUT = 1500; // Node.ts内の値に合わせる
const MAX_ELECTION_TIMEOUT = 3000; // Node.ts内の値に合わせる

export class RaftCluster {
  nodes: RaftNode[] = [];
  nodePositions: { [nodeId: string]: { x: number, y: number } } = {}; // ノードの初期位置を保持
  private messageQueue: RaftMessage[] = []; // Nodeから送られてきたメッセージを一時保持
  eventLog: SimulationEvent[] = []; // SimulationEvent[] 型に変更
  private nextNodeId = 1;
  private logCounter = 0; // クライアントコマンド用のシンプルなカウンター

  constructor(initialNodes: number) {
    this.initializeNodes(initialNodes);
    this.logEvent('ClusterInitialized', { nodeCount: initialNodes });
  }

  // ノードの初期化と配置
  private initializeNodes(count: number): void {
      this.nodes = [];
      this.nodePositions = {};
      this.nextNodeId = 1;
      const radius = 200; // 配置円の半径
      const centerX = 300; // 配置円の中心X
      const centerY = 300; // 配置円の中心Y

      for (let i = 0; i < count; i++) {
          const angle = (i / count) * 2 * Math.PI;
          const x = Math.round(centerX + radius * Math.cos(angle));
          const y = Math.round(centerY + radius * Math.sin(angle));
          const nodeId = `N${this.nextNodeId++}`;
          const position = { x, y };
          this.nodePositions[nodeId] = position; // 初期位置を保存
          this.nodes.push(new RaftNode(nodeId, position));
      }
      this.nodes.forEach(node => node.initialize(this)); // initialize を呼び出す
      this.logEvent('NodesInitialized', { nodeIds: this.nodes.map(n => n.id) });
  }

  // クラスタのリセット
  reset(nodeCount: number = 3): void {
    console.log(`Resetting cluster with ${nodeCount} nodes.`);
    // 既存ノードのタイマー等を停止
    this.nodes.forEach(node => node.stop());

    // ノードリスト、メッセージキュー、イベントログをクリア
    this.nodes = [];
    this.messageQueue = [];
    this.eventLog = []; // イベントログもクリア
    this.nextNodeId = 1; // ノードIDもリセット
    this.logCounter = 0; // コマンドカウンターもリセット

    // 新しいノードで再初期化
    this.initializeNodes(nodeCount);
    this.logEvent('ClusterReset', { newNodeCount: nodeCount });
  }

  // ノード追加
  addNode(): void {
    const newNodeId = `N${this.nextNodeId++}`;
    // 新しいノードの配置場所を適当に決める (ここでは端に追加する例)
    // TODO: もう少しましな配置ロジックにする
    const existingNodeIds = Object.keys(this.nodePositions);
    let newX = 50;
    let newY = 50;
    if(existingNodeIds.length > 0) {
        // 簡易的に最後のノードの近くに配置
        const lastNodeId = existingNodeIds[existingNodeIds.length - 1];
        const lastPos = this.nodePositions[lastNodeId];
        newX = lastPos.x + 60; // 少し右にずらす
        newY = lastPos.y;
    }
    const newPosition = { x: newX, y: newY };
    this.nodePositions[newNodeId] = newPosition; // 位置情報を記録

    const newNode = new RaftNode(newNodeId, newPosition);
    this.nodes.push(newNode);
    newNode.initialize(this); // initialize を呼び出す
    this.logEvent('NodeAdded', { nodeId: newNodeId, position: newPosition });
    console.log(`Node ${newNodeId} added.`);
  }

  // ノード削除 (ID指定)
  removeNode(nodeId: string): void {
      const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex !== -1) {
          const nodeToRemove = this.nodes[nodeIndex];
          nodeToRemove.stop(); // ノードのタイマー等を停止
          this.nodes.splice(nodeIndex, 1); // 配列から削除
          delete this.nodePositions[nodeId]; // 位置情報も削除

          // 関連するメッセージをキューから削除 (送信者または受信者が削除ノード)
          this.messageQueue = this.messageQueue.filter(
              msg => msg.senderId !== nodeId && msg.receiverId !== nodeId
          );

          this.logEvent('NodeRemoved', { nodeId });
          console.log(`Node ${nodeId} removed.`);
      } else {
          console.warn(`Node ${nodeId} not found for removal.`);
      }
  }

  // ノード停止
  stopNode(nodeId: string): void {
      const node = this.getNodeById(nodeId);
      if (node && node.state !== 'Stopped') {
          node.stop(); // 内部状態をStoppedにし、タイマーを止める
          this.logEvent('NodeStopped', { nodeId });
          console.log(`Node ${nodeId} stopped.`);
          // 関連するメッセージをキューから削除しても良いかもしれない
          this.messageQueue = this.messageQueue.filter(
            msg => msg.senderId !== nodeId && msg.receiverId !== nodeId
          );
      }
  }

  // ノード再開
  resumeNode(nodeId: string): void {
      const node = this.getNodeById(nodeId);
      if (node && node.state === 'Stopped') {
          node.resume(); // resumeメソッドが存在し、内部でタイマー開始される
          this.logEvent('NodeResumed', { nodeId });
          console.log(`Node ${nodeId} resumed.`);
      }
  }


  // 他のノードのIDリストを取得
  getOtherNodeIds(nodeId: string): string[] {
    return this.nodes.filter(n => n.id !== nodeId && n.state !== 'Stopped').map(n => n.id);
  }

  // 全ノードの情報を取得 (UI表示用)
  getAllNodeInfo(): RaftNodeInfo[] {
    return this.nodes.map(node => node.getInfo());
  }

  // ノードIDからノードインスタンスを取得
  getNodeById(nodeId: string): RaftNode | undefined {
      return this.nodes.find(n => n.id === nodeId);
  }

  // RaftNodeから送られてきたメッセージをClusterのキューに入れる
  // RaftNode内の sendMessage がこれを呼び出す想定 (RaftNode側の修正も必要になる可能性)
  queueMessageFromNode(message: RaftMessage): void {
    this.messageQueue.push(message);
    // this.logEvent('MessageSent', { type: message.type, from: message.senderId, to: message.receiverId });
  }

  // 1ステップ進める: メッセージを処理し、Nodeからの新しいメッセージを収集
  step(): { nodeInfos: RaftNodeInfo[], messages: RaftMessage[], events: SimulationEvent[] } {
      const messagesToDeliver = [...this.messageQueue];
      this.messageQueue = []; // キューをクリア

      // 1. メッセージ配信フェーズ: 各Nodeにメッセージを渡す
      messagesToDeliver.forEach(msg => {
          const receiver = this.getNodeById(msg.receiverId);
          if (receiver && receiver.state !== 'Stopped') { // 停止中のノードには配信しない
              this.logEvent('MessageDelivered', { type: msg.type, from: msg.senderId, to: msg.receiverId });
              // receiver.handleMessage(msg); -> receiveMessage に変更
              receiver.receiveMessage(msg);
              // Node内でメッセージ処理が行われるため、Clusterのstepではこれ以上何もしない
          } else {
              this.logEvent('MessageDropped', { type: msg.type, from: msg.senderId, to: msg.receiverId, reason: receiver ? 'Receiver Stopped' : 'Receiver Not Found' });
          }
      });

      // 2. Node更新フェーズ (tick呼び出しは不要)
      // 代わりに、Node内部で発生した送信メッセージを収集する必要がある
      let newOutgoingMessages: RaftMessage[] = [];
      this.nodes.forEach(node => {
          if(node.state !== 'Stopped'){
              // Nodeが内部で生成した送信メッセージを取得
              newOutgoingMessages = newOutgoingMessages.concat(node.getOutgoingMessages());
          }
      });
      // 新しく発生したメッセージを次のステップのためにキューに追加
      newOutgoingMessages.forEach(msg => this.queueMessageFromNode(msg));


      // 現在のステップで *配信された* メッセージと最新のノード情報、イベントログを返す
      return {
          nodeInfos: this.getAllNodeInfo(),
          messages: messagesToDeliver, // このステップで処理された(配信された)メッセージ
          events: [...this.eventLog]
      };
  }

   // リーダーにコマンドを送信する (クライアントからのリクエストをシミュレート)
   sendCommandToLeader(command?: string): boolean {
    const leader = this.nodes.find(node => node.state === 'Leader');
    if (leader) {
        const cmdToSend = command || `CMD_${this.logCounter++}`;
        // leader.handleClientRequest(logEntry); -> receiveCommand に修正
        // LogEntryの作成は receiveCommand メソッド内で行われるため不要
        this.logEvent('ClientCommandSent', { leaderId: leader.id, command: cmdToSend });
        const success = leader.receiveCommand(cmdToSend);
        return success;
    } else {
        this.logEvent('ClientCommandFailed', { reason: 'No leader found' });
        console.warn("No leader found to send command.");
        return false; // リーダーが見つからなかった
    }
  }

  // イベントログ記録
  logEvent(type: string, details: Record<string, any>): void {
      const event: SimulationEvent = {
          timestamp: performance.now(), // 高精度タイマーを使用
          type: type,
          details: details
      };
      this.eventLog.push(event);
      // console.log(`Event: ${type}`, details);
      // イベントログが長くなりすぎないように制限する場合
      // if (this.eventLog.length > 1000) {
      //     this.eventLog.shift();
      // }
  }
}
