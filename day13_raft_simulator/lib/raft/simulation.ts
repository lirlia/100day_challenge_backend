// lib/raft/simulation.ts
import {
    NodeId, Term, NodeState, LogEntry, RaftNodeData, RPCMessage, SimulationEvent,
    RequestVoteArgs, AppendEntriesArgs, RequestVoteReply, AppendEntriesReply, ClientRequest
} from '../types/raft';
import {
    createInitialNodeData, getRandomElectionTimeout,
    becomeFollower, becomeCandidate, becomeLeader,
    handleRequestVote, handleAppendEntries
} from './nodeLogic';
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


// シミュレーションの初期状態を作成
export const createInitialSimulationState = (numNodes: number): SimulationState => {
    const initialNodes: RaftNodeData[] = [];
    const nodeIds: NodeId[] = [];
    const initialPositions = [
        { x: 150, y: 150 }, { x: 350, y: 150 }, { x: 250, y: 300 },
        { x: 150, y: 450 }, { x: 350, y: 450 } // 5ノードまでの初期位置例
    ];
    for (let i = 1; i <= numNodes; i++) {
        const pos = initialPositions[i - 1] ?? { x: 100 + Math.random()*400, y: 100 + Math.random()*400 }; // 適当に配置
        initialNodes.push(createInitialNodeData(`N${i}`, pos.x, pos.y));
        nodeIds.push(`N${i}`);
    }

    const leaderAuxiliaryData: SimulationState['leaderAuxiliaryData'] = {};
    const candidateAuxiliaryData: SimulationState['candidateAuxiliaryData'] = {};
    initialNodes.forEach(node => {
        leaderAuxiliaryData[node.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
        candidateAuxiliaryData[node.id] = { votesReceived: new Set() };
        // Initialize leader aux data even for non-leaders initially
        const lastLogIndex = node.log[node.log.length - 1].index;
        leaderAuxiliaryData[node.id].matchIndex[node.id] = lastLogIndex; // Self matchIndex
    });


    return {
        nodes: initialNodes,
        messageQueue: [],
        events: [{ timestamp: 0, description: `Simulation initialized with ${numNodes} nodes.` }],
        currentTime: 0,
        isRunning: false,
        leaderAuxiliaryData,
        candidateAuxiliaryData,
        config: { ...DEFAULT_CONFIG },
        lastCommandNumber: 0,
    };
};


// --- シミュレーションのステップ実行 ---

export const simulationTick = (currentState: SimulationState): SimulationState => {
    if (!currentState.isRunning) {
        return currentState;
    }

    // Initialize nextState without messageQueue initially
    let nextState = {
        ...currentState,
        currentTime: currentState.currentTime + 1,
        // messageQueue: [], // Don't initialize here
        events: [...currentState.events],
        leaderAuxiliaryData: JSON.parse(JSON.stringify(currentState.leaderAuxiliaryData)),
        candidateAuxiliaryData: JSON.parse(JSON.stringify(currentState.candidateAuxiliaryData)),
    };
    const newEvents: SimulationEvent[] = [];
    const outgoingMessages: QueuedMessage[] = [];

    const activeNodes = nextState.nodes.filter(n => n.state !== NodeState.Stopped);
    const activeNodeIds = activeNodes.map(n => n.id);
    const majority = Math.floor(activeNodes.length / 2) + 1;


    // --- 1. 各アクティブノードのタイマー処理 ---
    nextState.nodes = nextState.nodes.map(node => {
        if (node.state === NodeState.Stopped) return node;

        let newNodeData = { ...node };

        // Follower または Candidate: Election Timeout
        if ((node.state === NodeState.Follower || node.state === NodeState.Candidate) && newNodeData.electionTimeoutRemaining !== undefined) {
            newNodeData.electionTimeoutRemaining = (newNodeData.electionTimeoutRemaining ?? 0) - 1;

            if (newNodeData.electionTimeoutRemaining <= 0) {
                newEvents.push({ timestamp: nextState.currentTime, description: `Node ${newNodeData.id} election timeout! Starting election.` });
                newNodeData = becomeCandidate(newNodeData);
                // 候補者データをリセット/初期化
                nextState.candidateAuxiliaryData[newNodeData.id] = { votesReceived: new Set([newNodeData.id]) }; // 自分に投票

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
                    outgoingMessages.push({ to: peerId, message: rvArgs });
                    newEvents.push({ timestamp: nextState.currentTime, description: `Node ${newNodeData.id} sending RequestVote to Node ${peerId} (Term ${newNodeData.currentTerm})` });
                });
            }
        }

        // Leader: ハートビート送信 & ログ複製
        if (newNodeData.state === NodeState.Leader) {
           // Ensure leader aux data exists for this node
           if (!nextState.leaderAuxiliaryData[newNodeData.id]) {
               nextState.leaderAuxiliaryData[newNodeData.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
               const lastLogIndex = newNodeData.log[newNodeData.log.length - 1].index;
               nextState.leaderAuxiliaryData[newNodeData.id].matchIndex[newNodeData.id] = lastLogIndex;
           }
           const leaderAux = nextState.leaderAuxiliaryData[newNodeData.id];

           activeNodeIds.filter(id => id !== newNodeData.id).forEach(peerId => {
               // nextIndex が初期化されていない場合は初期化
               if(leaderAux.nextIndex[peerId] === undefined) {
                   leaderAux.nextIndex[peerId] = newNodeData.log.length;
                   leaderAux.matchIndex[peerId] = 0;
                   leaderAux.heartbeatTimers[peerId] = 0; // 最初は即時送信
               }

               const nextIdx = leaderAux.nextIndex[peerId] ?? newNodeData.log.length;
               const needsReplication = nextIdx < newNodeData.log.length; // 新しいログがあるか
               leaderAux.heartbeatTimers[peerId] = (leaderAux.heartbeatTimers[peerId] ?? nextState.config.heartbeatInterval) - 1;

               // ハートビートタイミング、または新しいログがある場合に AppendEntries を送信
               if (leaderAux.heartbeatTimers[peerId] <= 0 || needsReplication) {
                   const prevLogIndex = nextIdx - 1;
                   // Ensure prevLogIndex is valid
                   if (prevLogIndex < 0) {
                        console.error(`Leader ${newNodeData.id}: Invalid prevLogIndex ${prevLogIndex} for peer ${peerId}`);
                        return; // Skip sending AppendEntries for this peer this tick
                   }
                   const prevLogTerm = newNodeData.log[prevLogIndex]?.term ?? 0; // index 0 はダミーエントリ
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
                   outgoingMessages.push({ to: peerId, message: aeArgs });
                   if (entriesToSend.length > 0) {
                       newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} sending ${entriesToSend.length} log entries (starting ${nextIdx}) to Node ${peerId}` });
                   } else {
                       // newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} sending Heartbeat to Node ${peerId}` });
                   }
                   leaderAux.heartbeatTimers[peerId] = nextState.config.heartbeatInterval; // タイマーリセット
               }
           });
        }

        // コミット済みログの適用 (Apply)
        if (newNodeData.lastApplied < newNodeData.commitIndex) {
            for (let i = newNodeData.lastApplied + 1; i <= newNodeData.commitIndex; i++) {
                const entry = newNodeData.log[i];
                if (entry) {
                    newEvents.push({ timestamp: nextState.currentTime, description: `Node ${newNodeData.id} applying log [${i}]: ${entry.command} (Term ${entry.term})` });
                    // ここで本来はステートマシンにコマンドを適用する
                } else {
                     console.error(`Node ${newNodeData.id}: Tried to apply non-existent log at index ${i}`);
                }
            }
            newNodeData = { ...newNodeData, lastApplied: newNodeData.commitIndex };
        }


        return newNodeData;
    });

     // --- 2. メッセージキューの処理 ---
    currentState.messageQueue.forEach(queuedMsg => {
         const processMessage = (targetNodeId: NodeId) => {
            const targetNodeIndex = nextState.nodes.findIndex(n => n.id === targetNodeId);
            if (targetNodeIndex === -1) {
                // newEvents.push({ timestamp: nextState.currentTime, description: `Message target ${targetNodeId} not found (might be stopped/removed).` });
                return; // 宛先ノードが存在しない
            }
            let targetNode = nextState.nodes[targetNodeIndex];
            if (targetNode.state === NodeState.Stopped) {
                // newEvents.push({ timestamp: nextState.currentTime, description: `Message to stopped node ${targetNode.id} ignored.` });
                return; // 停止中のノードはメッセージを無視
            }

            const message = queuedMsg.message;
            let newNodeData = { ...targetNode };
            let reply: RPCMessage | null = null;
            let replyTo: NodeId | null = null;

            switch (message.type) {
                case 'ClientRequest':
                    // リーダーのみがクライアントリクエストを処理
                    if (newNodeData.state === NodeState.Leader) {
                        newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} received client request: ${message.command}` });
                        const newLogIndex = newNodeData.log.length;
                        const newLogEntry: LogEntry = {
                            term: newNodeData.currentTerm,
                            command: message.command,
                            index: newLogIndex,
                        };
                        newNodeData.log = [...newNodeData.log, newLogEntry];

                        // 自分自身のmatchIndexを更新
                        if (nextState.leaderAuxiliaryData[newNodeData.id]) {
                           nextState.leaderAuxiliaryData[newNodeData.id].matchIndex[newNodeData.id] = newLogIndex;
                        } else {
                            console.warn(`Leader ${newNodeData.id} missing auxiliary data.`);
                        }


                        // 新しいログをフォロワーに複製開始 (タイマー処理側で送信される)
                        newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} appended log [${newLogIndex}]: ${message.command}` });
                        // ハートビートタイマーを即時トリガーする
                        const leaderAux = nextState.leaderAuxiliaryData[newNodeData.id];
                        if (leaderAux) {
                             activeNodeIds.filter(id => id !== newNodeData.id).forEach(peerId => {
                                 leaderAux.heartbeatTimers[peerId] = 0;
                             });
                        }
                    } else {
                        // リーダーでない場合は無視するか、リーダーに転送する (今回は無視)
                        newEvents.push({ timestamp: nextState.currentTime, description: `Node ${newNodeData.id} (not Leader) ignoring client request.` });
                    }
                    break;
                case 'RequestVote':
                    const rvResult = handleRequestVote(newNodeData, message);
                    newNodeData = rvResult.newNodeData;
                    reply = rvResult.reply;
                    replyTo = message.candidateId; // 返信先は候補者
                    // イベントログは nodeLogic 側で出力しているのでここでは不要かも
                    break;
                case 'AppendEntries':
                    const aeResult = handleAppendEntries(newNodeData, message);
                    newNodeData = aeResult.newNodeData;
                    reply = aeResult.reply;
                    replyTo = message.leaderId; // 返信先はリーダー
                    // イベントログは nodeLogic 側で出力
                    break;
                case 'RequestVoteReply':
                    replyTo = null; // 応答への応答はない
                    // Candidate が自分の ID 宛の応答かチェック
                    if (newNodeData.state === NodeState.Candidate && targetNodeId === newNodeData.id && message.term === newNodeData.currentTerm) {
                        newEvents.push({ timestamp: nextState.currentTime, description: `Candidate ${newNodeData.id} received vote reply from Node ${message.from} (Granted: ${message.voteGranted})` });
                        if (message.voteGranted) {
                             // Ensure candidate aux data exists
                            if (!nextState.candidateAuxiliaryData[newNodeData.id]) {
                                nextState.candidateAuxiliaryData[newNodeData.id] = { votesReceived: new Set([newNodeData.id])}; // Re-initialize if lost
                            }
                            const candidateAux = nextState.candidateAuxiliaryData[newNodeData.id];
                            candidateAux.votesReceived.add(message.from);
                            // 過半数獲得チェック
                            if (candidateAux.votesReceived.size >= majority) {
                                newEvents.push({ timestamp: nextState.currentTime, description: `Node ${newNodeData.id} received majority votes and becomes Leader (Term ${newNodeData.currentTerm})!` });
                                newNodeData = becomeLeader(newNodeData);
                                // Leader 補助情報を初期化
                                if (!nextState.leaderAuxiliaryData[newNodeData.id]) {
                                    nextState.leaderAuxiliaryData[newNodeData.id] = { nextIndex: {}, matchIndex: {}, heartbeatTimers: {} };
                                }
                                const leaderAux = nextState.leaderAuxiliaryData[newNodeData.id];
                                leaderAux.matchIndex = {};
                                leaderAux.nextIndex = {};
                                leaderAux.heartbeatTimers = {};
                                const lastLogIndex = newNodeData.log[newNodeData.log.length - 1].index;
                                // 自分自身の matchIndex を設定
                                leaderAux.matchIndex[newNodeData.id] = lastLogIndex;
                                activeNodeIds.filter(id => id !== newNodeData.id).forEach(peerId => {
                                    leaderAux.nextIndex[peerId] = lastLogIndex + 1;
                                    leaderAux.matchIndex[peerId] = 0;
                                    leaderAux.heartbeatTimers[peerId] = 0; // 即座にハートビートを送信トリガー
                                });
                                // delete nextState.candidateAuxiliaryData[newNodeData.id]; // Clean up candidate data
                            }
                        } else if (message.term > newNodeData.currentTerm) {
                             // より新しい Term のノードが存在 -> Follower に戻る
                             newEvents.push({ timestamp: nextState.currentTime, description: `Candidate ${newNodeData.id} reverting to Follower due to higher term (${message.term}) from Node ${message.from}` });
                            newNodeData = becomeFollower(newNodeData, message.term);
                            // delete nextState.candidateAuxiliaryData[newNodeData.id]; // Clean up candidate data
                        }
                    }
                    break;
                 case 'AppendEntriesReply':
                    replyTo = null; // 応答への応答はない
                     // Leader が自分の ID 宛の応答かチェック
                     if (newNodeData.state === NodeState.Leader && targetNodeId === newNodeData.id && message.term === newNodeData.currentTerm) {
                          // Ensure leader aux data exists
                         if (!nextState.leaderAuxiliaryData[newNodeData.id]) {
                             console.warn(`Leader ${newNodeData.id} received AppendEntriesReply but has no auxiliary data.`);
                             break;
                         }
                         const leaderAux = nextState.leaderAuxiliaryData[newNodeData.id];
                         const peerId = message.from;
                         if(leaderAux.matchIndex[peerId] === undefined){ // Check if peer is known to this leader term
                              // console.warn(`Leader ${newNodeData.id} received AppendEntriesReply from unknown peer ${peerId}`);
                              break; // Ignore reply from unknown/removed peer
                         }

                         if (message.success) {
                            // 成功した場合、matchIndex と nextIndex を更新
                            const newMatchIndex = message.matchIndex;
                            const oldMatchIndex = leaderAux.matchIndex[peerId] ?? 0;
                            if(newMatchIndex > oldMatchIndex){
                                leaderAux.matchIndex[peerId] = newMatchIndex;
                                leaderAux.nextIndex[peerId] = newMatchIndex + 1;
                                newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} updated matchIndex for ${peerId} to ${newMatchIndex}` });

                                // commitIndex の更新チェック
                                const matchIndices = activeNodeIds
                                    .map(id => leaderAux.matchIndex[id] ?? 0)
                                    .filter(idx => idx !== undefined); // Filter out undefined potentially

                                if (matchIndices.length < majority) {
                                    // Not enough active nodes reporting matchIndex? Should not happen if leaderAux is updated correctly
                                    console.warn(`Leader ${newNodeData.id}: Not enough matchIndices (${matchIndices.length}) to calculate majority (${majority}).`);
                                    break;
                                }

                                matchIndices.sort((a, b) => b - a); // 降順ソート
                                const majorityMatchIndex = matchIndices[majority - 1]; // 過半数が到達しているインデックス

                                // 新しい commitIndex は現在の Term のものである必要がある
                                const logEntryAtMajorityIndex = newNodeData.log[majorityMatchIndex];
                                if (majorityMatchIndex > newNodeData.commitIndex && logEntryAtMajorityIndex?.term === newNodeData.currentTerm) {
                                    newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} updating commitIndex from ${newNodeData.commitIndex} to ${majorityMatchIndex}` });
                                    newNodeData = { ...newNodeData, commitIndex: majorityMatchIndex };
                                    // Apply はタイマー処理側で行う
                                }
                            }

                         } else {
                             // 失敗した場合
                             if (message.term > newNodeData.currentTerm) {
                                 // より新しい Term のノードが存在 -> Follower に戻る
                                 newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} reverting to Follower due to higher term (${message.term}) from Node ${message.from}` });
                                 newNodeData = becomeFollower(newNodeData, message.term);
                                 // delete nextState.leaderAuxiliaryData[newNodeData.id]; // Clean up leader data
                             } else {
                                 // ログ不整合 -> nextIndex をデクリメントして再試行
                                const oldNextIndex = leaderAux.nextIndex[peerId] ?? 1;
                                leaderAux.nextIndex[peerId] = Math.max(1, oldNextIndex - 1);
                                newEvents.push({ timestamp: nextState.currentTime, description: `Leader ${newNodeData.id} received failed AppendEntries reply from ${peerId}. Decrementing nextIndex for ${peerId} to ${leaderAux.nextIndex[peerId]}` });
                                // 即時再送したい場合は、ここで heartbeatTimer[peerId] = 0 にする
                                leaderAux.heartbeatTimers[peerId] = 0;
                             }
                         }
                     }
                    break;
                }

                nextState.nodes[targetNodeIndex] = newNodeData; // 更新されたノードデータを状態に反映

                if (reply && replyTo) {
                     // Check if replyTo node is still active before sending
                     if (nextState.nodes.find(n => n.id === replyTo && n.state !== NodeState.Stopped)) {
                         outgoingMessages.push({ to: replyTo, message: reply });
                     } else {
                         // newEvents.push({ timestamp: nextState.currentTime, description: `Reply from ${newNodeData.id} to ${replyTo} ignored (target stopped or removed).` });
                     }
                }
         }; // end of processMessage

         if (queuedMsg.to === 'broadcast') {
             activeNodeIds.forEach(id => processMessage(id));
         } else {
             processMessage(queuedMsg.to);
         }
     });


    // --- 3. 新しいイベントを追加 ---
    nextState.events = [...nextState.events, ...newEvents].slice(-200); // Increase event log history

    // --- 4. 次のメッセージキューを設定 ---
    // 型安全のため、finalState を作成して messageQueue を設定
    const finalState: SimulationState = {
        ...(nextState as Omit<SimulationState, 'messageQueue'>), // Cast nextState to exclude messageQueue temporarily
        messageQueue: outgoingMessages // このティックで生成されたメッセージを次のティックで処理
    };

    return finalState; // finalState を返す
};

// --- シミュレーション操作関数 ---

export const startSimulation = (state: SimulationState): SimulationState => {
    if (state.isRunning) return state;
    return { ...state, isRunning: true, events: [...state.events, { timestamp: state.currentTime, description: "Simulation started." }] };
};

export const pauseSimulation = (state: SimulationState): SimulationState => {
     if (!state.isRunning) return state;
    return { ...state, isRunning: false, events: [...state.events, { timestamp: state.currentTime, description: "Simulation paused." }] };
};

export const resetSimulation = (state: SimulationState): SimulationState => {
    const numNodes = state.nodes.length; // Keep current number of nodes
    const newState = createInitialSimulationState(numNodes);
    newState.events = [{ timestamp: 0, description: `Simulation reset to ${numNodes} nodes.` }]; // Clean event log except reset message
    return newState;
};

export const addClientRequestToSimulation = (state: SimulationState): SimulationState => {
    const leader = state.nodes.find(n => n.state === NodeState.Leader);
    const nextCommandNumber = state.lastCommandNumber + 1;
    const command = `CMD_${nextCommandNumber}`;

    if (leader) {
        const clientReq: ClientRequest = { type: 'ClientRequest', command };
        // Add request directly to the outgoing queue for next tick processing
        const outgoingMessages = [...state.messageQueue, { to: leader.id, message: clientReq }];
        return {
            ...state,
            messageQueue: outgoingMessages, // Add to queue immediately
            events: [...state.events, { timestamp: state.currentTime, description: `Client request '${command}' added to queue for Leader ${leader.id}.` }],
            lastCommandNumber: nextCommandNumber,
        };
    } else {
        return {
            ...state,
            events: [...state.events, { timestamp: state.currentTime, description: `Client request '${command}' ignored (no leader).` }]
            // lastCommandNumber はインクリメントしない
        };
    }
};

export const stopNodeInSimulation = (state: SimulationState, nodeId: NodeId): SimulationState => {
    let nodeIndex = -1;
    const nodes = state.nodes.map((n, idx) => {
        if (n.id === nodeId) {
            nodeIndex = idx;
            return {
                ...n,
                state: NodeState.Stopped,
                isLeader: false,
                electionTimeoutRemaining: undefined,
            };
        }
        return n;
    });

    if (nodeIndex === -1) return state; // Node not found

    // Clean up auxiliary data related to the stopped node
    const leaderAux = JSON.parse(JSON.stringify(state.leaderAuxiliaryData));
    const candidateAux = JSON.parse(JSON.stringify(state.candidateAuxiliaryData));
    delete leaderAux[nodeId]; // Remove leader data if it was leader
    delete candidateAux[nodeId]; // Remove candidate data if it was candidate
    // Remove references *to* the stopped node from other nodes' aux data
    Object.keys(leaderAux).forEach(id => {
        delete leaderAux[id].nextIndex[nodeId];
        delete leaderAux[id].matchIndex[nodeId];
        delete leaderAux[id].heartbeatTimers[nodeId];
    });
     Object.keys(candidateAux).forEach(id => {
         // Votes don't need explicit cleanup, they just won't count towards majority
     });


    return {
        ...state,
        nodes,
        leaderAuxiliaryData: leaderAux,
        candidateAuxiliaryData: candidateAux,
        events: [...state.events, { timestamp: state.currentTime, description: `Node ${nodeId} stopped.` }]
    };
};

export const resumeNodeInSimulation = (state: SimulationState, nodeId: NodeId): SimulationState => {
    let nodeIndex = -1;
    const nodes = state.nodes.map((n, idx) => {
         if (n.id === nodeId && n.state === NodeState.Stopped) {
             nodeIndex = idx;
             return {
                 ...n,
                 state: NodeState.Follower,
                 currentTerm: n.currentTerm, // Keep its term, will be updated by RPC
                 votedFor: null,
                 electionTimeoutRemaining: getRandomElectionTimeout(),
                 // Keep log, commitIndex, lastApplied as they were
             };
         }
         return n;
     });

    if (nodeIndex === -1) return state; // Node not found or not stopped

    // Re-initialize auxiliary data for the resumed node
    const leaderAux = JSON.parse(JSON.stringify(state.leaderAuxiliaryData));
    const candidateAux = JSON.parse(JSON.stringify(state.candidateAuxiliaryData));
    const lastLogIndex = nodes[nodeIndex].log[nodes[nodeIndex].log.length - 1].index;
    leaderAux[nodeId] = { nextIndex: {}, matchIndex: { [nodeId]: lastLogIndex }, heartbeatTimers: {} }; // Initialize self matchIndex
    candidateAux[nodeId] = { votesReceived: new Set() };

    // Potentially update other leaders' aux data if they exist? Less critical.

    return {
        ...state,
        nodes,
        leaderAuxiliaryData: leaderAux,
        candidateAuxiliaryData: candidateAux,
        events: [...state.events, { timestamp: state.currentTime, description: `Node ${nodeId} resumed as Follower.` }]
    };
};

// TODO: addNodeToSimulation, removeNodeFromSimulation (構成変更プロトコル)
