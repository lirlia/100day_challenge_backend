import { NodeId, Term, NodeState, LogEntry, RaftNodeData, RequestVoteArgs, AppendEntriesArgs, RequestVoteReply, AppendEntriesReply } from '../types/raft';

// ノードの初期状態を作成する関数
export const createInitialNodeData = (id: NodeId, x: number, y: number): RaftNodeData => ({
  id,
  state: NodeState.Follower,
  currentTerm: 0,
  votedFor: null,
  log: [{ term: 0, command: 'INIT', index: 0 }], // ダミーのインデックス0エントリ
  commitIndex: 0,
  lastApplied: 0,
  position: { x, y },
  electionTimeoutRemaining: getRandomElectionTimeout(), // 初期 election timeout
  isLeader: false,
});

// --- Raft タイマー関連 ---
const BASE_ELECTION_TIMEOUT = 150; // ティック単位 (例: 150ms * 10ms/tick = 1.5s)
const ELECTION_TIMEOUT_RANGE = 150; // ランダム幅

// ランダムな election timeout 値を生成 (ティック単位)
export const getRandomElectionTimeout = (): number => {
  return BASE_ELECTION_TIMEOUT + Math.floor(Math.random() * ELECTION_TIMEOUT_RANGE);
}

// --- 状態遷移関数 (例) ---

// Follower に遷移する
export const becomeFollower = (node: RaftNodeData, term: Term): RaftNodeData => {
  console.log(`Node ${node.id}: Becoming Follower for term ${term}`);
  return {
    ...node,
    state: NodeState.Follower,
    currentTerm: term,
    votedFor: null,
    isLeader: false,
    electionTimeoutRemaining: getRandomElectionTimeout(), // 新しいタイムアウトを設定
  };
};

// Candidate に遷移する
export const becomeCandidate = (node: RaftNodeData): RaftNodeData => {
  const newTerm = node.currentTerm + 1;
  console.log(`Node ${node.id}: Becoming Candidate for term ${newTerm}`);
  return {
    ...node,
    state: NodeState.Candidate,
    currentTerm: newTerm,
    votedFor: node.id, // 自分自身に投票
    isLeader: false,
    electionTimeoutRemaining: getRandomElectionTimeout(), // 選挙開始、新しいタイムアウト
  };
};

// Leader に遷移する
export const becomeLeader = (node: RaftNodeData): RaftNodeData => {
    console.log(`Node ${node.id}: Becoming Leader for term ${node.currentTerm}`);
    // 注意: 実際のリーダー選出には過半数の票が必要
    // LeaderになったらelectionTimeoutは不要になるが、便宜上残しておく or undefined にする
    return {
        ...node,
        state: NodeState.Leader,
        isLeader: true,
        electionTimeoutRemaining: undefined, // リーダーは election timeout しない
        // nextIndex, matchIndex の初期化も必要 (シミュレーション管理側で行うことが多い)
    };
};

// --- RPC ハンドラ (骨格) ---

export const handleRequestVote = (node: RaftNodeData, args: RequestVoteArgs): { newNodeData: RaftNodeData, reply: RequestVoteReply } => {
  let voteGranted = false;
  let updatedNode = { ...node }; // 元のnodeを変更しないようにコピー
  let term = updatedNode.currentTerm;

  // 1. 要求元の Term が自分の Term より古い場合は拒否
  if (args.term < updatedNode.currentTerm) {
      voteGranted = false;
  }
  // 2. 要求元の Term が新しい場合、または同じ Term でまだ投票していない、かつ候補者のログが自分と同じか新しい場合
  else if (
    (args.term > updatedNode.currentTerm) ||
    (args.term === updatedNode.currentTerm && (updatedNode.votedFor === null || updatedNode.votedFor === args.candidateId))
  ) {
    // ログの比較 (候補者のログが自分のログ以上であるか)
    const myLastLog = updatedNode.log[updatedNode.log.length - 1];
    const candidateLogIsUpToDate =
      args.lastLogTerm > myLastLog.term ||
      (args.lastLogTerm === myLastLog.term && args.lastLogIndex >= myLastLog.index);

    if (candidateLogIsUpToDate) {
      // Term が新しい場合は Follower になる
      if (args.term > updatedNode.currentTerm) {
          updatedNode = becomeFollower(updatedNode, args.term);
          term = args.term; // term を更新
      }
      // 同じ Term で投票可能な場合、または新しい Term で Follower になった後
      if(updatedNode.votedFor === null || updatedNode.votedFor === args.candidateId){
          voteGranted = true;
          updatedNode = { ...updatedNode, votedFor: args.candidateId };
          console.log(`Node ${updatedNode.id}: Voted for ${args.candidateId} in term ${term}`);
          // 投票したら election timeout をリセット
          updatedNode = { ...updatedNode, electionTimeoutRemaining: getRandomElectionTimeout() };
      } else {
          console.log(`Node ${updatedNode.id}: Rejected vote for ${args.candidateId} (already voted for ${updatedNode.votedFor} in term ${term})`);
      }
    } else {
        console.log(`Node ${updatedNode.id}: Rejected vote for ${args.candidateId} (log not up-to-date)`);
         // Term が新しい場合でもログが古ければ Follower にはなる
         if (args.term > updatedNode.currentTerm) {
             updatedNode = becomeFollower(updatedNode, args.term);
             term = args.term; // term を更新
         }
    }
  } else {
      console.log(`Node ${updatedNode.id}: Rejected vote for ${args.candidateId} (already voted or older term)`);
      // Term が同じで既に他の候補者に投票済みの場合は term は更新しない
      // Term が args.term より新しい場合も term は更新しない
  }


  const reply: RequestVoteReply = {
    type: 'RequestVoteReply',
    term: term, // 自身の現在の(更新後の)Termを返す
    voteGranted: voteGranted,
    from: updatedNode.id,
    to: args.candidateId,
  };

  return { newNodeData: updatedNode, reply };
};

export const handleAppendEntries = (node: RaftNodeData, args: AppendEntriesArgs): { newNodeData: RaftNodeData, reply: AppendEntriesReply } => {
    let success = false;
    let updatedNode = { ...node }; // 元のnodeを変更しないようにコピー
    let term = updatedNode.currentTerm;
    let matchIndex = 0; // シミュレーション用

    // 1. 要求元の Term が自分の Term より古い場合は拒否
    if (args.term < updatedNode.currentTerm) {
        success = false;
    } else {
        // 要求元の Term が新しいか、同じ場合は Follower になる（または維持）
        // Candidate も Leader からの有効な AppendEntries を受けたら Follower になる
        if (args.term > updatedNode.currentTerm || updatedNode.state === NodeState.Candidate) {
            updatedNode = becomeFollower(updatedNode, args.term);
            term = args.term; // term を更新
        }
        // ハートビートを受け取ったか、ログを受け取る準備ができた -> election timeout リセット
        // Follower のみリセット
        if (updatedNode.state === NodeState.Follower) {
            updatedNode = { ...updatedNode, electionTimeoutRemaining: getRandomElectionTimeout() };
        }
        success = true; // 現時点では成功とする（ログ整合性チェックは後で）

        // 2. ログ整合性チェック
        // prevLogIndex が自分のログの範囲外、または Term が一致しない場合
        if (updatedNode.log.length <= args.prevLogIndex || updatedNode.log[args.prevLogIndex].term !== args.prevLogTerm) {
            success = false;
            console.log(`Node ${updatedNode.id}: Rejected AppendEntries from ${args.leaderId}. Reason: Log inconsistency. My log at index ${args.prevLogIndex}: ${updatedNode.log[args.prevLogIndex] ? `Term ${updatedNode.log[args.prevLogIndex].term}` : 'None'}. Leader's prevLogTerm: ${args.prevLogTerm}`);
            matchIndex = updatedNode.commitIndex; // 失敗時の matchIndex は Raft 仕様では定義されないが、シミュレーション用に commitIndex を返す
        } else {
            // 3. ログの追加/更新
            if (args.entries.length > 0) {
                console.log(`Node ${updatedNode.id}: Received ${args.entries.length} entries from Leader ${args.leaderId} starting at index ${args.prevLogIndex + 1}`);
                // 既存のエントリとのコンフリクトチェックと削除
                let conflictFound = false;
                let newLog = updatedNode.log.slice(0, args.prevLogIndex + 1); // 一致した部分までを取得

                args.entries.forEach((entry, i) => {
                    const logIndex = args.prevLogIndex + 1 + i;
                    if (logIndex < updatedNode.log.length && updatedNode.log[logIndex].term !== entry.term) {
                        // コンフリクト発見！既存のログをここから削除
                        console.log(`Node ${updatedNode.id}: Log conflict detected at index ${logIndex}. Truncating existing log.`);
                        conflictFound = true;
                        // newLog は既に slice されているので、以降のエントリを追加するだけでよい
                    }
                    if (!conflictFound) {
                         // コンフリクトがない場合、またはコンフリクト後のエントリを追加
                         if (logIndex >= newLog.length) { // 自分のログの末尾に追加する場合のみ
                             newLog.push({...entry, index: logIndex }); // インデックスを正しく設定
                         }
                    } else {
                         // コンフリクトが見つかった後は、リーダーからの新しいエントリを単純に追加
                         newLog.push({...entry, index: logIndex });
                    }
                });
                 updatedNode.log = newLog; // ログを更新
            } else {
                // console.log(`Node ${updatedNode.id}: Received heartbeat from Leader ${args.leaderId}`);
            }
            // 成功した場合、matchIndex はリーダーから送られてきた最後のログのインデックス
            matchIndex = args.prevLogIndex + args.entries.length;

            // 4. commitIndex の更新
            if (args.leaderCommit > updatedNode.commitIndex) {
                // leaderCommit と自分のログの最後のインデックスのうち小さい方を新しい commitIndex にする
                const newCommitIndex = Math.min(args.leaderCommit, matchIndex);
                if (newCommitIndex > updatedNode.commitIndex) {
                    updatedNode = { ...updatedNode, commitIndex: newCommitIndex };
                    console.log(`Node ${updatedNode.id}: Updated commitIndex to ${updatedNode.commitIndex}`);
                    // Apply logs は simulationTick 側で行う
                }
            }
        }
    }


    const reply: AppendEntriesReply = {
        type: 'AppendEntriesReply',
        term: term, // 自身の現在の(更新後の)Termを返す
        success: success,
        matchIndex: matchIndex, // Raft仕様にはないが、リーダーがnextIndexを効率的に更新するために含めることが多い
        from: updatedNode.id,
        to: args.leaderId,
    };

    return { newNodeData: updatedNode, reply };
};
