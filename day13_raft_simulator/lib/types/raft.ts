// lib/types/raft.ts

export type NodeId = number | string; // ノードを識別するための一意なID
export type Term = number; // Raft の Term (論理時間)

// ノードの状態を表す Enum
export enum NodeState {
  Follower = 'Follower',
  Candidate = 'Candidate',
  Leader = 'Leader',
  Stopped = 'Stopped', // シミュレーション用に停止状態を追加
}

// ログエントリの型
export interface LogEntry {
  term: Term;
  command: string; // シミュレートするコマンド
  index: number; // ログ内でのインデックス (便宜上追加)
}

// UI表示用の座標
export interface Point { // ★★★ Point の定義を追加 ★★★
    x: number;
    y: number;
}

// RequestVote RPC の引数
export interface RequestVoteArgs {
  type: 'RequestVote';
  term: Term;
  candidateId: NodeId;
  lastLogIndex: number;
  lastLogTerm: Term;
}

// RequestVote RPC の応答
export interface RequestVoteReply {
  type: 'RequestVoteReply';
  term: Term;
  voteGranted: boolean;
  voterId: NodeId; // ★★★ voterId を追加 ★★★
}

// AppendEntries RPC の引数
export interface AppendEntriesArgs {
  type: 'AppendEntries';
  term: Term;
  leaderId: NodeId;
  prevLogIndex: number;
  prevLogTerm: Term;
  entries: LogEntry[]; // 送信するログエントリ (空の場合はハートビート)
  leaderCommit: number; // リーダーの commitIndex
}

// AppendEntries RPC の応答
export interface AppendEntriesReply {
  type: 'AppendEntriesReply';
  term: Term;
  success: boolean;
  followerId: NodeId; // ★★★ followerId を追加 ★★★
  // オプションのフィールド
  conflictTerm?: Term;
  conflictIndex?: number;
  lastLogIndexIncluded?: number;
}

// クライアントからのリクエスト (シミュレーション用)
export interface ClientRequest {
  type: 'ClientRequest';
  command: string;
}

// RPCメッセージの型ユニオン
export type RPCMessage = RequestVoteArgs | RequestVoteReply | AppendEntriesArgs | AppendEntriesReply;

// シミュレーションイベントの型 (ログ表示用)
export interface SimulationEvent {
  timestamp: number; // イベント発生時刻 (シミュレーション時間)
  description: string; // イベント内容の説明
}

// ノードの完全な状態 (UI表示やシミュレーション管理用)
export interface RaftNodeData {
    id: NodeId;
    state: NodeState;
    currentTerm: Term;
    votedFor: NodeId | null;
    log: LogEntry[];
    commitIndex: number;
    lastApplied: number;
    // UI 表示用
    position: { x: number; y: number };
    // タイマー情報 (可視化用)
    electionTimeoutRemaining?: number; // 残り時間など (オプション)
    isLeader?: boolean; // リーダーかどうかを明確にするフラグ (オプション)
}

// UI表示用のRPCデータ (矢印など)
export interface RpcData { // ★★★ RpcData の定義を追加 ★★★
    id: string; // 一意なID (アニメーションや識別用)
    from: NodeId;
    to: NodeId | 'broadcast';
    type: RPCMessage['type'] | ClientRequest['type'];
    term: Term;
    timestamp: number; // 送信開始/完了タイムスタンプ
    // success?: boolean; // RpcArrow で使う場合はこれも追加検討
    // duration?: number; // 転送にかかる時間 (ティック)
}
