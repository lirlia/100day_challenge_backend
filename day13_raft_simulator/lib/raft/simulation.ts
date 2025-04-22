// lib/raft/simulation.ts
import {
    NodeId, Term, NodeState, LogEntry, RaftNodeData, RPCMessage, SimulationEvent,
    RequestVoteArgs, AppendEntriesArgs, RequestVoteReply, AppendEntriesReply, ClientRequest,
    Point, RpcData // Point, RpcData を追加
} from '../types/raft';
import {
    createInitialNodeData, getRandomElectionTimeout,
    becomeFollower, becomeCandidate, becomeLeader,
    handleRequestVote, handleAppendEntries
} from './nodeLogic'
// import { stat } from 'fs'; // Removed unused import

// メッセージキューのエントリ型 (宛先情報を含む)
export interface QueuedMessage { // Already exported
    to: NodeId | 'broadcast'; // 宛先ノードID または ブロードキャスト
    message: RPCMessage | ClientRequest; // 送信するメッセージ本体
    // オプション: 遅延などのシミュレーション用情報
    // delayTicks?: number;
}

// シミュレーション全体のの状態
export interface SimulationState {
    nodes: RaftNodeData[];
    messageQueue: QueuedMessage[]; // ノード間で転送中のメッセージキュー (宛先付き)
    events: SimulationEvent[]; // 発生したイベントのログ
    currentTime: number; // シミュレーション時間 (ティック数)
    isRunning: boolean; // シミュレーションが実行中か
    // Leaderの補助情報 (シミュレーション管理用)
    leaderAuxiliaryData: {
        [leaderId: NodeId]: {
            nextIndex: { [followerId: NodeId]: number };
            matchIndex: { [followerId: NodeId]: number };
            heartbeatTimers: { [followerId: NodeId]: number }; // 各フォロワーへのハートビート送信タイマー
        }
    };
    // Candidate の補助情報 (シミュレーション管理用)
    candidateAuxiliaryData: {
        [candidateId: NodeId]: {
            votesReceived: Set<NodeId>;
        }
    };
    config: { // シミュレーション設定
        heartbeatInterval: number; // ハートビート間隔 (ティック)
    };
    // 最後に生成したコマンド番号（クライアントリクエスト用）
    lastCommandNumber: number;
}

// シミュレーション設定のデフォルト値
const DEFAULT_CONFIG: SimulationState['config'] = {
    heartbeatInterval: 50, // election timeout より十分に短く
};

// シミュレーションクラス
export class Simulation {
    private nodes: RaftNodeData[] = [];
    private messageQueue: QueuedMessage[] = [];
    private rpcLog: RpcData[] = []; // 送受信されたRPCのログ
    private events: SimulationEvent[] = []; // 発生したイベントのログ
    private currentTime: number = 0; // シミュレーション時間 (ティック数)
    private isRunning: boolean = false; // シミュレーションが実行中か
    private leaderAuxiliaryData: {
        [leaderId: NodeId]: {
            nextIndex: { [followerId: NodeId]: number };
            matchIndex: { [followerId: NodeId]: number };
            heartbeatTimers: { [followerId: NodeId]: number };
        }
    } = {};
    private candidateAuxiliaryData: {
        [candidateId: NodeId]: {
            votesReceived: Set<NodeId>;
        }
    } = {};
    private config = { ...DEFAULT_CONFIG };
    private lastCommandNumber: number = 0;
    private numNodes: number;

    constructor(numNodes: number = 3) {
        this.numNodes = numNodes;
        this.reset();
    }

    // シミュレーションを初期状態にリセット
    reset() {
        this.nodes = [];
        this.messageQueue = [];
        this.rpcLog = [];
        this.events = [];
        this.currentTime = 0;
        this.isRunning = false;
        this.leaderAuxiliaryData = {};
        this.candidateAuxiliaryData = {};
        this.lastCommandNumber = 0;

        const initialPositions = [
            { x: 150, y: 150 }, { x: 350, y: 150 }, { x: 250, y: 300 },
            { x: 150, y: 450 }, { x: 350, y: 450 }
        ];
        for (let i = 1; i <= this.numNodes; i++) {
            const pos = initialPositions[i - 1] ?? { x: 100 + Math.random() * 400, y: 100 + Math.random() * 400 };
            const newNode = createInitialNodeData(`N${i}`, pos.x, pos.y);
            this.nodes.push(newNode);
            this.leaderAuxiliaryData[newNode.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
            this.candidateAuxiliaryData[newNode.id] = { votesReceived: new Set() };
            const lastLogIndex = newNode.log[newNode.log.length - 1].index;
            this.leaderAuxiliaryData[newNode.id].matchIndex[newNode.id] = lastLogIndex;
        }
        this.events.push({ timestamp: 0, description: `Simulation initialized with ${this.numNodes} nodes.` });
        console.log("Simulation reset complete.");
    }

    // シミュレーションを開始
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.events.push({ timestamp: this.currentTime, description: "Simulation started." });
            console.log("Simulation started.");
        }
    }

    // シミュレーションを一時停止
    pause() {
        if (this.isRunning) {
            this.isRunning = false;
            this.events.push({ timestamp: this.currentTime, description: "Simulation paused." });
            console.log("Simulation paused.");
        }
    }

    // 現在のシミュレーション状態を取得 (API用)
    getState() {
        return {
            nodes: this.nodes,
            rpcs: this.rpcLog, // RPCログも返す
            currentTime: this.currentTime,
            isRunning: this.isRunning,
            // events: this.events, // イベントログは大量になる可能性があるので、必要に応じて別途取得APIを作る
        };
    }

    // RPCを送信キューとログに追加
    private sendRpc(from: NodeId, to: NodeId | 'broadcast', message: RPCMessage | ClientRequest) {
        this.messageQueue.push({ to, message });

        // ログ用のRpcDataを作成
        const rpcData: RpcData = {
            id: `rpc-${this.currentTime}-${Math.random().toString(36).substring(2, 7)}`, // 一意なID
            from,
            // ブロードキャストの場合、宛先を特定できないので 'broadcast' のままにするか、
            // あるいは Simulation 側で展開して個別のRPCとして記録するか検討
            to: to === 'broadcast' ? 'broadcast' : to,
            type: message.type,
            term: (message as RPCMessage).term ?? -1, // ClientRequestにはtermがない
            timestamp: this.currentTime,
            // 必要に応じて他の情報 (successなど) も追加
        };
        this.rpcLog.push(rpcData);

        // 古いRPCログを削除
        this.rpcLog = this.rpcLog.filter(rpc => this.currentTime - rpc.timestamp < this.config.heartbeatInterval);
    }

    // ノードの状態をトグル (実行中/停止中)
    toggleNode(nodeId: NodeId) {
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex === -1) {
            console.warn(`Node ${nodeId} not found for toggling.`);
            return;
        }
        const node = this.nodes[nodeIndex];
        if (node.state === NodeState.Stopped) {
            // 停止中 -> 復帰 (Followerとして)
            // 最後に記録された状態に戻すのは複雑なので、シンプルにFollowerにする
            const newNode = becomeFollower(node, node.currentTerm); // タームは維持
            newNode.electionTimeoutRemaining = getRandomElectionTimeout(); // タイマーリセット
            this.nodes[nodeIndex] = newNode;
            this.events.push({ timestamp: this.currentTime, description: `Node ${nodeId} resumed as Follower.` });
            console.log(`Node ${nodeId} resumed as Follower.`);
        } else {
            // 実行中 -> 停止
            this.nodes[nodeIndex] = { ...node, state: NodeState.Stopped, electionTimeoutRemaining: undefined };
            this.events.push({ timestamp: this.currentTime, description: `Node ${nodeId} stopped.` });
            console.log(`Node ${nodeId} stopped.`);
            // 停止したノード宛てのメッセージをキューから削除（オプション）
            // this.messageQueue = this.messageQueue.filter(msg => msg.to !== nodeId);
        }
    }

    // ノードの位置を更新 (UI用)
    updateNodePosition(nodeId: NodeId, x: number, y: number) {
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
            this.nodes[nodeIndex].position = { x, y };
        } else {
            console.warn(`Node ${nodeId} not found for position update.`);
        }
    }

    // シミュレーションを1ステップ進める
    tick() {
        if (!this.isRunning) {
            return;
        }

        this.currentTime++;
        const currentMessages = [...this.messageQueue]; // 現在のキューを処理
        this.messageQueue = []; // 次のティックのためのキューをクリア
        const newEvents: SimulationEvent[] = [];
        // const outgoingMessages: QueuedMessage[] = []; // sendRpcを使うので不要

        const activeNodes = this.nodes.filter(n => n.state !== NodeState.Stopped);
        const activeNodeIds = activeNodes.map(n => n.id);
        const majority = Math.floor(activeNodes.length / 2) + 1;

        // --- 1. 各アクティブノードのタイマー処理と状態遷移 ---
        this.nodes = this.nodes.map(node => {
            if (node.state === NodeState.Stopped) return node;

            let newNodeData = { ...node };
            let nodeAuxChanged = false; // ノード固有の補助データが変更されたか

            // Follower または Candidate: Election Timeout
            if ((node.state === NodeState.Follower || node.state === NodeState.Candidate) && newNodeData.electionTimeoutRemaining !== undefined) {
                newNodeData.electionTimeoutRemaining = (newNodeData.electionTimeoutRemaining ?? 0) - 1;

                if (newNodeData.electionTimeoutRemaining <= 0) {
                    newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} election timeout! Starting election.` });
                    newNodeData = becomeCandidate(newNodeData);
                    // 候補者データをリセット/初期化
                    this.candidateAuxiliaryData[newNodeData.id] = { votesReceived: new Set([newNodeData.id]) }; // 自分に投票
                    nodeAuxChanged = true;

                    // 他の全アクティブノードに RequestVote を送信
                    const lastLog = newNodeData.log[newNodeData.log.length - 1];
                    activeNodeIds.filter(id => id !== newNodeData.id).forEach(peerId => {
                        const rvArgs: RequestVoteArgs = {
                            type: 'RequestVote',
                            term: newNodeData.currentTerm,
                            candidateId: newNodeData.id,
                            lastLogIndex: lastLog.index,
                            lastLogTerm: lastLog.term,
                        };
                        this.sendRpc(newNodeData.id, peerId, rvArgs);
                        newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} sending RequestVote to Node ${peerId} (Term ${newNodeData.currentTerm})` });
                    });
                }
            }

            // Leader: ハートビート送信 & ログ複製
            if (newNodeData.state === NodeState.Leader) {
                // Ensure leader aux data exists for this node
                if (!this.leaderAuxiliaryData[newNodeData.id]) {
                    this.leaderAuxiliaryData[newNodeData.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
                    const lastLogIndex = newNodeData.log[newNodeData.log.length - 1].index;
                    this.leaderAuxiliaryData[newNodeData.id].matchIndex[newNodeData.id] = lastLogIndex;
                    nodeAuxChanged = true;
                }
                const leaderAux = this.leaderAuxiliaryData[newNodeData.id];

                activeNodeIds.filter(id => id !== newNodeData.id).forEach(peerId => {
                    // nextIndex, matchIndex, heartbeatTimers が初期化されていない場合は初期化
                    if (leaderAux.nextIndex[peerId] === undefined) {
                        leaderAux.nextIndex[peerId] = newNodeData.log.length; // 次に送るべきログエントリのインデックス (リーダーの次のログから)
                        leaderAux.matchIndex[peerId] = 0; // フォロワーに複製された最新ログのインデックス (最初は0)
                        leaderAux.heartbeatTimers[peerId] = 0; // 最初は即時送信
                        nodeAuxChanged = true;
                    }


                    const nextIdx = leaderAux.nextIndex[peerId];
                    const needsReplication = nextIdx < newNodeData.log.length; // 新しいログがあるか
                    leaderAux.heartbeatTimers[peerId] = (leaderAux.heartbeatTimers[peerId] ?? this.config.heartbeatInterval) - 1;

                    // ハートビートタイミング、または新しいログがある場合に AppendEntries を送信
                    if (leaderAux.heartbeatTimers[peerId] <= 0 || needsReplication) {
                        const prevLogIndex = nextIdx - 1;
                        if (prevLogIndex < 0) {
                             console.error(`Leader ${newNodeData.id}: Invalid prevLogIndex ${prevLogIndex} for peer ${peerId}`);
                             return; // Skip sending for this peer this tick
                        }
                        const prevLogTerm = newNodeData.log[prevLogIndex]?.term ?? 0;
                        const entriesToSend = newNodeData.log.slice(nextIdx);

                        const aeArgs: AppendEntriesArgs = {
                            type: 'AppendEntries',
                            term: newNodeData.currentTerm,
                            leaderId: newNodeData.id,
                            prevLogIndex,
                            prevLogTerm,
                            entries: entriesToSend,
                            leaderCommit: newNodeData.commitIndex,
                        };
                        this.sendRpc(newNodeData.id, peerId, aeArgs);
                        if (entriesToSend.length > 0) {
                            newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} sending ${entriesToSend.length} log entries (starting ${nextIdx}) to Node ${peerId}` });
                        } else {
                            // newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} sending Heartbeat to Node ${peerId}` });
                        }
                        leaderAux.heartbeatTimers[peerId] = this.config.heartbeatInterval; // タイマーリセット
                        nodeAuxChanged = true; // heartbeatTimer が変更された
                    }
                });

                // リーダー自身のコミットインデックス更新チェック
                const lastLogIndex = newNodeData.log.length - 1;
                let potentialCommitIndex = newNodeData.commitIndex;
                for (let N = newNodeData.commitIndex + 1; N <= lastLogIndex; N++) {
                    // Check if log entry exists and is from the current term
                    if (newNodeData.log[N] && newNodeData.log[N].term === newNodeData.currentTerm) {
                        let matchCount = 1; // Leader itself matches
                        activeNodeIds.forEach(peerId => {
                            if (peerId !== newNodeData.id && (this.leaderAuxiliaryData[newNodeData.id]?.matchIndex[peerId] ?? 0) >= N) {
                                matchCount++;
                            }
                        });
                        // Check if majority of nodes (including leader) have replicated up to index N
                        if (matchCount >= majority) {
                            potentialCommitIndex = N; // Update potential commit index
                        } else {
                            break; // Subsequent indices cannot be committed yet
                        }
                    }
                }
                 // Update commitIndex if a higher index is replicated on a majority
                if (potentialCommitIndex > newNodeData.commitIndex) {
                     newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} updated commitIndex from ${newNodeData.commitIndex} to ${potentialCommitIndex}` });
                     newNodeData = { ...newNodeData, commitIndex: potentialCommitIndex };
                }

            } // End Leader Logic


            // コミット済みログの適用 (Apply) - 全ノード共通
            if (newNodeData.lastApplied < newNodeData.commitIndex) {
                for (let i = newNodeData.lastApplied + 1; i <= newNodeData.commitIndex; i++) {
                    const entry = newNodeData.log[i];
                    if (entry) {
                        newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} applying log [${i}]: ${entry.command} (Term ${entry.term})` });
                        // ステートマシン適用ロジック (ここでは省略)
                    } else {
                        console.error(`Node ${newNodeData.id}: Tried to apply non-existent log at index ${i}`);
                    }
                }
                newNodeData = { ...newNodeData, lastApplied: newNodeData.commitIndex };
            }

            // return newNodeData;
             // Return node data, ensuring auxiliary data is updated correctly
             // Although node data is updated in place, explicitly return the potentially modified object.
             // We don't need deep copies if nodeLogic functions return new objects,
             // but auxiliary data needs careful handling.
             if (nodeAuxChanged) {
                 // If auxiliary data changed, we might need to update the main state object reference
                 // For simplicity now, just return the modified node data.
             }
             return newNodeData;
        }); // End node map

        // --- 2. メッセージキューの処理 ---
        currentMessages.forEach(queuedMsg => {
            const processMessage = (targetNodeId: NodeId) => {
                const targetNodeIndex = this.nodes.findIndex(n => n.id === targetNodeId);
                if (targetNodeIndex === -1 || this.nodes[targetNodeIndex].state === NodeState.Stopped) {
                    // newEvents.push({ timestamp: this.currentTime, description: `Message to ${targetNodeId} ignored (not found or stopped).` });
                    return; // 宛先ノードが存在しないか停止中
                }

                let targetNode = this.nodes[targetNodeIndex];
                const message = queuedMsg.message;
                let newNodeData = { ...targetNode }; // Copy node data before modification
                let nodeAuxChanged = false;
                let reply: RPCMessage | null = null;
                let replyTo: NodeId | null = null;

                switch (message.type) {
                    case 'ClientRequest':
                        if (newNodeData.state === NodeState.Leader) {
                            newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} received client request: ${message.command}` });
                            const newLogIndex = newNodeData.log.length;
                            const newLogEntry: LogEntry = {
                                term: newNodeData.currentTerm,
                                command: message.command,
                                index: newLogIndex,
                            };
                            newNodeData.log = [...newNodeData.log, newLogEntry]; // Add to log
                            // Update leader's own matchIndex
                            this.leaderAuxiliaryData[newNodeData.id].matchIndex[newNodeData.id] = newLogIndex;
                            nodeAuxChanged = true;
                            // Reply to client would happen after commit, omitted here
                        } else {
                            // Redirect or drop client request if not leader
                            newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} (not Leader) ignored client request.` });
                        }
                        break;
                    case 'RequestVote':
                        const rvReply = handleRequestVote(newNodeData, message as RequestVoteArgs);
                        newNodeData = rvReply.newNodeData;
                        reply = rvReply.reply;
                        replyTo = message.candidateId;
                        if(rvReply.reply.voteGranted) {
                           newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} granted vote to ${message.candidateId} for Term ${message.term}` });
                           // Reset election timer upon granting vote
                           newNodeData.electionTimeoutRemaining = getRandomElectionTimeout();
                        } else {
                           // newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} rejected vote for ${message.candidateId} for Term ${message.term}` });
                        }
                         // Check if node needs to become follower based on term
                        if (newNodeData.currentTerm < message.term) {
                             newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} reverting to Follower (received higher term ${message.term})` });
                             newNodeData = becomeFollower(newNodeData, message.term);
                        }
                        break;
                    case 'AppendEntries':
                        const aeReply = handleAppendEntries(newNodeData, message as AppendEntriesArgs);
                        newNodeData = aeReply.newNodeData;
                        reply = aeReply.reply;
                        replyTo = message.leaderId;
                        if (aeReply.reply.success) {
                            // newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} accepted AppendEntries from ${message.leaderId} (Term ${message.term})`});
                             // Reset election timer upon successful AppendEntries from current leader
                             newNodeData.electionTimeoutRemaining = getRandomElectionTimeout();
                        } else {
                             // newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} rejected AppendEntries from ${message.leaderId} (Term ${message.term})`});
                        }
                         // Check if node needs to become follower based on term
                        if (newNodeData.currentTerm < message.term) {
                            newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} reverting to Follower (received higher term ${message.term} from ${message.leaderId})` });
                            newNodeData = becomeFollower(newNodeData, message.term);
                        }
                        break;
                    case 'RequestVoteReply':
                         if (newNodeData.state === NodeState.Candidate && message.term === newNodeData.currentTerm) {
                             if ((message as RequestVoteReply).voteGranted) {
                                 newEvents.push({ timestamp: this.currentTime, description: `Candidate ${newNodeData.id} received vote from ${message.voterId}` });
                                 if (this.candidateAuxiliaryData[newNodeData.id]) {
                                     this.candidateAuxiliaryData[newNodeData.id].votesReceived.add(message.voterId);
                                     nodeAuxChanged = true;
                                     // Check for majority
                                     if (this.candidateAuxiliaryData[newNodeData.id].votesReceived.size >= majority) {
                                         newEvents.push({ timestamp: this.currentTime, description: `Candidate ${newNodeData.id} becomes Leader for Term ${newNodeData.currentTerm}!` });
                                         newNodeData = becomeLeader(newNodeData);
                                         // Initialize leader aux data upon becoming leader
                                         this.leaderAuxiliaryData[newNodeData.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
                                         const lastLogIndex = newNodeData.log[newNodeData.log.length - 1].index;
                                         this.leaderAuxiliaryData[newNodeData.id].matchIndex[newNodeData.id] = lastLogIndex; // Leader matches its own log
                                         // Initialize nextIndex/matchIndex for all peers
                                         activeNodeIds.forEach(peerId => {
                                             if (peerId !== newNodeData.id) {
                                                 this.leaderAuxiliaryData[newNodeData.id].nextIndex[peerId] = lastLogIndex + 1;
                                                 this.leaderAuxiliaryData[newNodeData.id].matchIndex[peerId] = 0;
                                                 this.leaderAuxiliaryData[newNodeData.id].heartbeatTimers[peerId] = 0; // Send initial heartbeat/AE immediately
                                             }
                                         });
                                         nodeAuxChanged = true; // Leader aux data initialized
                                     }
                                 } else {
                                      console.error(`Candidate ${newNodeData.id} received vote but auxiliary data missing!`);
                                 }
                             } else {
                                 // newEvents.push({ timestamp: this.currentTime, description: `Candidate ${newNodeData.id} vote rejected by ${message.voterId}` });
                             }
                         } else if (message.term > newNodeData.currentTerm) {
                             // Received reply from a higher term, revert to follower
                              newEvents.push({ timestamp: this.currentTime, description: `Candidate ${newNodeData.id} reverting to Follower (received higher term ${message.term} in vote reply)` });
                              newNodeData = becomeFollower(newNodeData, message.term);
                         }
                         break;
                    case 'AppendEntriesReply':
                         if (newNodeData.state === NodeState.Leader && message.term === newNodeData.currentTerm) {
                              const peerId = message.followerId;
                              const leaderAux = this.leaderAuxiliaryData[newNodeData.id];
                              if(leaderAux) { // Check if leaderAux exists
                                  if ((message as AppendEntriesReply).success) {
                                      // newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} received success AE reply from ${peerId}` });
                                      // Update nextIndex and matchIndex for the follower
                                      const lastIndexSent = (message as AppendEntriesReply).lastLogIndexIncluded ?? (leaderAux.nextIndex[peerId] -1); // Infer if not provided
                                      leaderAux.nextIndex[peerId] = lastIndexSent + 1;
                                      leaderAux.matchIndex[peerId] = lastIndexSent;
                                      nodeAuxChanged = true;

                                       // Check if commit index can be advanced
                                       // Find the highest log index N such that N > commitIndex and a majority of matchIndex[i] >= N
                                       // and log[N].term == currentTerm.
                                       const potentialCommitIndex = newNodeData.commitIndex; // Start checking from next index
                                       const lastLogIndex = newNodeData.log.length - 1;
                                       for (let N = potentialCommitIndex + 1; N <= lastLogIndex; N++) {
                                           if (newNodeData.log[N]?.term === newNodeData.currentTerm) { // Only commit logs from own term via count
                                               let matchCount = 1; // Leader itself matches
                                               activeNodeIds.forEach(pId => {
                                                   if (pId !== newNodeData.id && (leaderAux.matchIndex[pId] ?? 0) >= N) {
                                                       matchCount++;
                                                   }
                                               });
                                               if (matchCount >= majority) {
                                                    if (N > newNodeData.commitIndex) {
                                                        newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} advancing commitIndex to ${N} (majority match)` });
                                                        newNodeData = { ...newNodeData, commitIndex: N };
                                                    }
                                               } else {
                                                   break; // Cannot commit further
                                               }
                                           }
                                       }


                                  } else { // AppendEntries failed
                                      // newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} received failed AE reply from ${peerId}` });
                                      // Decrement nextIndex for this follower and retry
                                      leaderAux.nextIndex[peerId] = Math.max(1, leaderAux.nextIndex[peerId] - 1); // Ensure nextIndex >= 1
                                      nodeAuxChanged = true;
                                      // Optionally: Send AE immediately again (or wait for next heartbeat interval)
                                  }
                              } else {
                                   console.error(`Leader ${newNodeData.id} received AE reply but auxiliary data missing!`);
                              }
                         } else if (message.term > newNodeData.currentTerm) {
                               // Received reply from a higher term, revert to follower
                               newEvents.push({ timestamp: this.currentTime, description: `Leader ${newNodeData.id} reverting to Follower (received higher term ${message.term} in AE reply)` });
                               newNodeData = becomeFollower(newNodeData, message.term);
                         }
                         break;

                     default:
                         console.warn(`Node ${newNodeData.id} received unknown message type:`, message);
                 } // End switch message.type

                 // Update node state in the main array *after* processing the message
                 this.nodes[targetNodeIndex] = newNodeData;

                 // Send reply if one was generated
                 if (reply && replyTo) {
                     this.sendRpc(newNodeData.id, replyTo, reply);
                     // newEvents.push({ timestamp: this.currentTime, description: `Node ${newNodeData.id} sending ${reply.type} reply to Node ${replyTo}` });
                 }
            }; // End processMessage

            // Deliver message to target(s)
            if (queuedMsg.to === 'broadcast') {
                activeNodeIds.forEach(nodeId => processMessage(nodeId));
            } else {
                processMessage(queuedMsg.to);
            }
        }); // End messageQueue forEach


        // Add new events from this tick
        this.events.push(...newEvents);
         // Limit event log size (optional)
         if (this.events.length > 1000) {
             this.events = this.events.slice(-1000);
         }

    } // End tick()


    // --- クライアントリクエスト関連 ---
    addClientRequest(command: string) {
        const leader = this.nodes.find(n => n.state === NodeState.Leader);
        if (!leader) {
            console.warn("No leader available to handle client request.");
            this.events.push({ timestamp: this.currentTime, description: `Client request '${command}' failed: No leader.` });
            return { success: false, message: "No leader available." };
        }

        const clientRequest: ClientRequest = {
            type: 'ClientRequest',
            command: command,
            // clientId and requestId could be added for exactly-once semantics
        };

        // リーダーのメッセージキューに直接追加するか、sendRpcを使う
        this.sendRpc('client' as NodeId, leader.id, clientRequest); // 'client' は仮の送信元ID
        this.events.push({ timestamp: this.currentTime, description: `Client request '${command}' sent to Leader ${leader.id}.` });
        console.log(`Client request '${command}' sent to Leader ${leader.id}.`);
        return { success: true, message: `Request sent to leader ${leader.id}` };
    }


} // End Class Simulation

// シミュレーションインスタンスを作成してエクスポート (シングルトン)
export const simulation = new Simulation();

// --- 以前の関数ベースのAPI（クラスに移行したためコメントアウトまたは削除） ---
/*
export const createInitialSimulationState = ... (削除)
export const simulationTick = ... (削除)
export const startSimulation = ... (削除)
export const pauseSimulation = ... (削除)
export const resetSimulation = ... (削除)
export const addClientRequestToSimulation = ... (削除)
export const stopNodeInSimulation = ... (削除)
export const resumeNodeInSimulation = ... (削除)
*/
