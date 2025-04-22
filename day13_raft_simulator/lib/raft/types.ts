// lib/raft/types.ts

// Raftノードの状態
export type RaftNodeState = 'Follower' | 'Candidate' | 'Leader' | 'Stopped';

// ログエントリの型
export interface LogEntry {
  term: number;
  command: string; // シミュレーション用のシンプルなコマンド文字列
}

// RequestVote RPC の引数
export interface RequestVoteArgs {
  term: number;          // candidateのterm
  candidateId: string;   // candidateのID
  lastLogIndex: number;  // candidateの最後のログエントリのindex
  lastLogTerm: number;   // candidateの最後のログエントリのterm
}

// RequestVote RPC の結果
export interface RequestVoteReply {
  term: number;          // currentTerm, for candidate to update itself
  voteGranted: boolean;  // true means candidate received vote
}

// AppendEntries RPC の引数
export interface AppendEntriesArgs {
  term: number;          // leaderのterm
  leaderId: string;      // leaderのID
  prevLogIndex: number;  // 新しいエントリの直前のログエントリのindex
  prevLogTerm: number;   // 新しいエントリの直前のログエントリのterm
  entries: LogEntry[];   // 保存するログエントリ (heartbeatの場合は空)
  leaderCommit: number;  // leaderのcommitIndex
}

// AppendEntries RPC の結果
export interface AppendEntriesReply {
  term: number;          // currentTerm, for leader to update itself
  success: boolean;      // true if follower contained entry matching prevLogIndex and prevLogTerm
  matchIndex?: number;   // AppendEntriesが失敗した場合に、フォロワーがリーダーと一致する最新のログインデックスを返す (最適化のため)
}

// ノード間でやり取りされるメッセージの型 (RPCの抽象化)
export type RaftMessage =
  | { type: 'RequestVote'; args: RequestVoteArgs; senderId: string; receiverId: string }
  | { type: 'RequestVoteReply'; reply: RequestVoteReply; senderId: string; receiverId: string }
  | { type: 'AppendEntries'; args: AppendEntriesArgs; senderId: string; receiverId: string }
  | { type: 'AppendEntriesReply'; reply: AppendEntriesReply; senderId: string; receiverId: string };

// シミュレーションで発生するイベントの型
export interface SimulationEvent {
  timestamp: number;
  type: string; // 例: 'ElectionStarted', 'Voted', 'BecameLeader', 'LogAppended', 'LogCommitted', 'NodeAdded', 'NodeRemoved', 'NodeStopped', 'NodeResumed'
  nodeId?: string; // イベントに関連するノードID
  details: Record<string, any>; // イベントの詳細情報
}

// Raftノードの完全な状態 (UI表示用)
export interface RaftNodeInfo {
  id: string;
  state: RaftNodeState;
  currentTerm: number;
  votedFor: string | null;
  log: LogEntry[];
  commitIndex: number;
  lastApplied: number;
  // Leader固有の状態 (Leaderの場合のみ)
  nextIndex?: { [followerId: string]: number };
  matchIndex?: { [followerId: string]: number };
  // UI用の位置情報など
  position: { x: number; y: number };
}
