import {
  RaftNodeState,
  LogEntry,
  RequestVoteArgs,
  RequestVoteReply,
  AppendEntriesArgs,
  AppendEntriesReply,
  RaftNodeInfo,
  RaftMessage,
} from './types';

// Raftノードを表すクラス
export class RaftNode {
  // --- Raft Persistent State ---
  id: string;                  // ノードの一意なID
  currentTerm: number = 0;     // 最新のterm (初期値0, 単調増加)
  votedFor: string | null = null; // 現在のtermで投票した候補者のID (なければnull)
  log: LogEntry[] = [{ term: 0, command: '' }]; // ログエントリ (最初のダミーエントリを含む)

  // --- Raft Volatile State ---
  commitIndex: number = 0;     // コミットされた最大のログエントリindex (初期値0, 単調増加)
  lastApplied: number = 0;     // ステートマシンに適用された最大のログエントリindex (初期値0, 単調増加)

  // --- Leader Volatile State (リーダーのみ再初期化) ---
  nextIndex: { [followerId: string]: number } = {}; // 各フォロワーに次に送信するログエントリのindex (初期値 leader last log index + 1)
  matchIndex: { [followerId: string]: number } = {}; // 各フォロワーと一致している最大のログエントリindex (初期値0, 単調増加)

  // --- シミュレーション用状態 ---
  state: RaftNodeState = 'Follower'; // ノードの現在の状態
  electionTimeoutId: NodeJS.Timeout | null = null; // 選挙タイムアウトタイマー
  heartbeatTimeoutId: NodeJS.Timeout | null = null; // ハートビートタイマー (Leader用)
  votesReceived: Set<string> = new Set();      // Candidateが受け取った投票の数
  cluster: {
    nodes: RaftNode[];
    getNodeById: (id: string) => RaftNode | undefined;
    logEvent: (type: string, details: Record<string, any>) => void;
    getOtherNodeIds: (id: string) => string[];
  } | null = null;
  messageQueue: RaftMessage[] = []; // 受信メッセージキュー (シミュレーション用)
  outgoingMessages: RaftMessage[] = []; // 送信メッセージキュー (シミュレーション用)
  position: { x: number; y: number }; // UI表示用の位置

  // --- 定数 ---
  private ELECTION_TIMEOUT_MIN = 1500; // ms
  private ELECTION_TIMEOUT_MAX = 3000; // ms
  private HEARTBEAT_INTERVAL = 500;   // ms

  constructor(id: string, position: { x: number; y: number }) {
    this.id = id;
    this.position = position;
    // 初期の選挙タイムアウトを設定
    // this.resetElectionTimeout(); // Cluster側で開始するように変更
  }

  // --- 外部から呼び出されるメソッド ---

  // クラスターへの参照と初期化
  initialize(cluster: {
      nodes: RaftNode[];
      getNodeById: (id: string) => RaftNode | undefined;
      logEvent: (type: string, details: Record<string, any>) => void;
      getOtherNodeIds: (id: string) => string[];
  }): void {
    this.cluster = cluster;
    // if (this.state !== 'Stopped') {
    //     this.resetElectionTimeout(); // <<< この行を削除またはコメントアウト
    // }
  }

  // シミュレーションの1ステップを実行
  step(): void {
    if (this.state === 'Stopped') return;

    // 受信メッセージを処理
    const message = this.messageQueue.shift();
    if (message) {
      this.handleMessage(message);
    }

    // 状態に応じた処理 (タイマーチェックなど)
    // タイマーのチェックは別途 Cluster 側のループで行う想定
    // もしくは、タイマーコールバック内で直接アクションを起こす
  }

  // メッセージを受信キューに追加
  receiveMessage(message: RaftMessage): void {
    if (this.state !== 'Stopped') {
      // this.messageQueue.push(message); // キューイングをやめる
      // メッセージ受信イベントは handleMessage 内でログする
      this.handleMessage(message); // 直接処理する
    }
  }

  // 送信メッセージキューからメッセージを取得
  getOutgoingMessages(): RaftMessage[] {
    const messages = [...this.outgoingMessages];
    this.outgoingMessages = [];
    return messages;
  }

  // 外部からのコマンド受信 (Leaderのみ有効)
  receiveCommand(command: string): boolean {
    if (this.state !== 'Leader') {
      return false; // Leader以外はコマンドを受け付けない
    }
    const newEntry: LogEntry = { term: this.currentTerm, command };
    this.log.push(newEntry);
    console.log(`Node ${this.id} (Leader) received command: ${command}. Log index: ${this.getLastLogIndex()}`);
    // すぐにAppendEntriesを送信 (heartbeatも兼ねる)
    this.sendAppendEntriesToAll();
    // 自分自身のmatchIndexを更新
    this.matchIndex[this.id] = this.getLastLogIndex();
    this.nextIndex[this.id] = this.getLastLogIndex() + 1;
    // コミット可能かチェック (自分自身のログ追加だけではコミットされないはずだが念のため)
    this.tryCommit();
    return true;
  }

  // ノードを停止する
  stop(): void {
    if (this.state === 'Stopped') return;
    this.logEvent('NodeStopped', {}); // 停止イベント
    this.state = 'Stopped';
    this.clearTimeouts();
    this.messageQueue = [];
    this.outgoingMessages = [];
    console.log(`Node ${this.id} stopped.`);
  }

  // ノードを再開する
  resume(): void {
    if (this.state === 'Stopped') {
      this.logEvent('NodeResumed', {}); // 再開イベント
      this.state = 'Follower';
      // Termは停止前のものを維持する（他のノードから更新される可能性があるため）
      this.votedFor = null;
      this.votesReceived.clear();
      // Leader関連の状態もリセット
      this.nextIndex = {};
      this.matchIndex = {};
      this.resetElectionTimeout();
      console.log(`Node ${this.id} resumed as Follower in term ${this.currentTerm}.`);
    }
  }

  // ノードの現在の情報を取得 (UI表示用)
  getInfo(): RaftNodeInfo {
    return {
      id: this.id,
      state: this.state,
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      log: [...this.log],
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      nextIndex: this.state === 'Leader' ? { ...this.nextIndex } : undefined,
      matchIndex: this.state === 'Leader' ? { ...this.matchIndex } : undefined,
      position: { ...this.position },
    };
  }

  // UIからの位置更新
  updatePosition(position: { x: number; y: number }): void {
      this.position = position;
  }

  // --- 内部ヘルパーメソッド ---

  // ClusterのlogEventを呼び出すためのヘルパーメソッド
  private logEvent(type: string, details: Record<string, any>): void {
    if (this.cluster) {
      // nodeIdと現在のtermを自動的に付与
      this.cluster.logEvent(type, { ...details, nodeId: this.id, term: this.currentTerm });
    } else {
      console.warn(`Node ${this.id}: Cannot log event, cluster reference is null.`);
    }
  }

  // 選挙タイムアウトをリセットして開始
  public resetElectionTimeout(): void {
    this.clearElectionTimeout();
    const timeout = Math.random() * (this.ELECTION_TIMEOUT_MAX - this.ELECTION_TIMEOUT_MIN) + this.ELECTION_TIMEOUT_MIN;
    this.logEvent('TimerStarted', { timerType: 'election', duration: Math.round(timeout) }); // イベントログ
    this.electionTimeoutId = setTimeout(() => {
      if (this.state !== 'Stopped') {
        this.logEvent('TimerElapsed', { timerType: 'election' }); // イベントログ
        console.log(`Node ${this.id} election timeout! Starting election.`);
        this.becomeCandidate();
      }
    }, timeout);
  }

  // 選挙タイムアウトタイマーをクリア
  private clearElectionTimeout(): void {
    if (this.electionTimeoutId) {
      clearTimeout(this.electionTimeoutId);
      this.electionTimeoutId = null;
    }
  }

  // ハートビートタイマーを開始 (Leader用)
  public startHeartbeat(): void {
    this.clearHeartbeatTimeout();
    this.logEvent('TimerStarted', { timerType: 'heartbeat', duration: this.HEARTBEAT_INTERVAL }); // イベントログ
    this.sendAppendEntriesToAll(true); // 初回も送信 (内部で AppendEntriesSent イベント)
    this.heartbeatTimeoutId = setInterval(() => {
        if (this.state === 'Leader') {
            // this.logEvent('TimerElapsed', { timerType: 'heartbeat' }); // タイマー経過より送信イベントの方が情報が多い
            this.sendAppendEntriesToAll(true); // 内部で AppendEntriesSent イベント
        }
    }, this.HEARTBEAT_INTERVAL);
    console.log(`Node ${this.id} started heartbeat.`);
  }

  // ハートビートタイマーを停止
  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutId) {
      clearInterval(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  // すべてのタイマーをクリア
  public clearTimeouts(): void {
    this.clearElectionTimeout();
    this.clearHeartbeatTimeout();
  }

  // メッセージ処理のメインロジック
  private handleMessage(message: RaftMessage): void {
    // メッセージ受信自体のログは Cluster.step で MessageDelivered として記録されている
    // this.logEvent(message.type + 'Received', { ... }); // 必要ならここで詳細情報をログ

    // 共通のTermチェック
    const messageTerm = message.type === 'RequestVote' || message.type === 'AppendEntries'
        ? message.args.term
        : message.reply.term;

    if (messageTerm > this.currentTerm) {
        console.log(`Node ${this.id} detected higher term ${messageTerm} (current: ${this.currentTerm}). Becoming Follower.`);
        // becomeFollower内でイベントログ (BecameFollower)
        this.becomeFollower(messageTerm);
    }

    if (this.state === 'Stopped') return;

    // メッセージタイプに応じた処理
    switch (message.type) {
      case 'RequestVote':
        this.handleRequestVote(message.args, message.senderId);
        break;
      case 'RequestVoteReply':
        if (message.reply.term === this.currentTerm && this.state === 'Candidate') {
            this.handleRequestVoteReply(message.reply, message.senderId);
        } // 古いTermや状態違いは無視 (ログは任意)
        break;
      case 'AppendEntries':
        if (message.args.term < this.currentTerm) {
            this.sendAppendEntriesReply(message.senderId, false); // 内部で AppendEntriesFailed イベント
        } else {
            this.handleAppendEntries(message.args, message.senderId);
        }
        break;
      case 'AppendEntriesReply':
        if (message.reply.term === this.currentTerm && this.state === 'Leader') {
            this.handleAppendEntriesReply(message.reply, message.senderId);
        } // 古いTermや状態違いは無視 (ログは任意)
        break;
    }
  }

  // --- 状態遷移メソッド ---

  private becomeFollower(newTerm: number): void {
    const oldState = this.state;
    this.state = 'Follower';
    this.currentTerm = newTerm;
    this.votedFor = null;
    this.votesReceived.clear();
    this.clearHeartbeatTimeout();
    this.resetElectionTimeout(); // 内部で TimerStarted イベント
    this.logEvent('BecameFollower', { oldState: oldState, newTerm: newTerm }); // イベントログ
  }

  private becomeCandidate(): void {
    if (this.state === 'Stopped') return;
    const oldState = this.state;
    this.state = 'Candidate';
    this.currentTerm++;
    this.votedFor = this.id;
    this.votesReceived.clear();
    this.votesReceived.add(this.id);
    this.logEvent('BecameCandidate', { oldState: oldState }); // イベントログ
    console.log(`Node ${this.id} became Candidate for term ${this.currentTerm}. Voted for self.`);
    this.clearHeartbeatTimeout();
    this.resetElectionTimeout(); // 内部で TimerStarted イベント
    this.sendRequestVoteToAll(); // 内部で RequestVoteSent イベント
    this.checkElectionWin();
  }

  private becomeLeader(): void {
    if (this.state !== 'Candidate') return;
    const oldState = this.state;
    this.state = 'Leader';
    this.votedFor = null;
    this.votesReceived.clear();
    this.clearElectionTimeout(); // Leaderは選挙タイマー不要
    this.logEvent('BecameLeader', { oldState: oldState }); // イベントログ
    console.log(`Node ${this.id} became Leader for term ${this.currentTerm}!`);
    // Leaderとしての状態を初期化
    this.nextIndex = {};
    this.matchIndex = {};
    const lastLogIdx = this.getLastLogIndex();
    this.cluster?.nodes.forEach(node => {
        if (node.id !== this.id) {
            this.nextIndex[node.id] = lastLogIdx + 1;
            this.matchIndex[node.id] = 0;
        }
    });
    // 自分自身も追加 (コミットチェックのため)
    this.matchIndex[this.id] = lastLogIdx;
    this.nextIndex[this.id] = lastLogIdx + 1;

    // 就任直後にハートビートを送信し、タイマーを開始
    this.startHeartbeat(); // 内部で TimerStarted, AppendEntriesSent イベント
  }

  // --- RPC ハンドラ ---

  private handleRequestVote(args: RequestVoteArgs, candidateId: string): void {
    let voteGranted = false;
    let reason = '';
    const replyTerm = this.currentTerm;

    if (args.term < this.currentTerm) {
        voteGranted = false; reason = 'term';
        console.log(`Node ${this.id} rejected vote request from ${candidateId} (term ${args.term} < ${this.currentTerm})`);
    } else if (this.votedFor === null || this.votedFor === candidateId) {
        const lastLogTerm = this.getLastLogTerm();
        const lastLogIndex = this.getLastLogIndex();
        if (args.lastLogTerm > lastLogTerm || (args.lastLogTerm === lastLogTerm && args.lastLogIndex >= lastLogIndex)) {
            console.log(`Node ${this.id} granted vote to ${candidateId} for term ${args.term}`);
            voteGranted = true;
            this.votedFor = candidateId;
            this.resetElectionTimeout(); // 内部で TimerStarted イベント
        } else {
            reason = 'log';
            console.log(`Node ${this.id} rejected vote request from ${candidateId} (log outdated: candidate [${args.lastLogTerm}, ${args.lastLogIndex}] vs self [${lastLogTerm}, ${lastLogIndex}])`);
        }
    } else {
        reason = 'voted';
        console.log(`Node ${this.id} rejected vote request from ${candidateId} (already voted for ${this.votedFor} in term ${this.currentTerm})`);
    }

    // イベントログ (結果)
    if (voteGranted) {
        this.logEvent('VoteGranted', { candidateId: candidateId });
    } else {
        this.logEvent('VoteRejected', { candidateId: candidateId, reason: reason });
    }

    const reply: RequestVoteReply = { term: replyTerm, voteGranted };
    this.sendMessage({ type: 'RequestVoteReply', reply, senderId: this.id, receiverId: candidateId }); // 内部で RequestVoteReplySent イベント
  }

  private handleRequestVoteReply(reply: RequestVoteReply, senderId: string): void {
    // Candidate 状態などは handleMessage でチェック済み
    if (reply.voteGranted) {
      this.votesReceived.add(senderId);
      this.checkElectionWin(); // 内部で BecameLeader イベント
    }
    // 拒否された場合のログは任意
  }

  private checkElectionWin(): void {
    if (this.state !== 'Candidate') return;
    const clusterSize = this.cluster?.nodes.filter(n => n.state !== 'Stopped').length ?? 1;
    const majority = Math.floor(clusterSize / 2) + 1;

    if (this.votesReceived.size >= majority) {
      console.log(`Node ${this.id} (Candidate) received majority votes (${this.votesReceived.size}/${clusterSize}). Becoming Leader.`);
      this.becomeLeader(); // 内部で BecameLeader イベント
    }
  }

  private handleAppendEntries(args: AppendEntriesArgs, leaderId: string): void {
    let success = false;
    let matchIndex: number | undefined = undefined;
    let reason = '';

    // Termチェックは handleMessage で実施済み
    // 古いLeaderからのメッセージは拒否応答済み

    // Leader発見 => Followerへ遷移
    if (this.state === 'Candidate') {
        this.becomeFollower(args.term); // 内部で BecameFollower, TimerStarted イベント
    }
    // 有効なLeaderからのメッセージ => タイマーリセット
    this.resetElectionTimeout(); // 内部で TimerStarted イベント

    const prevLogEntry = this.log[args.prevLogIndex];
    if (!prevLogEntry || prevLogEntry.term !== args.prevLogTerm) {
        success = false;
        reason = 'log mismatch';
        console.log(`Node ${this.id} rejected AppendEntries from ${leaderId}. Log mismatch at index ${args.prevLogIndex}. Expected term ${args.prevLogTerm}, got ${prevLogEntry?.term}.`);
    } else {
        success = true;
        let index = args.prevLogIndex + 1;
        let entryIndex = 0;
        // ... (ログの衝突検出と削除) ...
        // ... (新しいエントリの追加) ...
        if (args.entries.length > 0 && entryIndex < args.entries.length) {
             const addedCount = args.entries.length - entryIndex;
             this.logEvent('LogEntryAdded', { count: addedCount, startIndex: index });
        }

        matchIndex = this.getLastLogIndex();

        // コミットインデックスの更新
        if (args.leaderCommit > this.commitIndex) {
            const oldCommitIndex = this.commitIndex;
            this.commitIndex = Math.min(args.leaderCommit, this.getLastLogIndex());
            if (this.commitIndex > oldCommitIndex) {
                 this.logEvent('CommitIndexAdvanced', { commitIndex: this.commitIndex, oldCommitIndex: oldCommitIndex }); // イベントログ
            }
            this.applyCommittedLogs();
        }
    }

    this.sendAppendEntriesReply(leaderId, success, matchIndex); // 内部で AppendEntriesSuccess/Failed イベント
  }

  // AppendEntries への応答を送信するヘルパー
  private sendAppendEntriesReply(leaderId: string, success: boolean, matchIndex?: number): void {
    // イベントログ (結果)
    this.logEvent(success ? 'AppendEntriesSuccess' : 'AppendEntriesFailed', { leaderId: leaderId, success: success, matchIndex: matchIndex });
    const reply: AppendEntriesReply = { term: this.currentTerm, success, matchIndex };
    this.sendMessage({ type: 'AppendEntriesReply', reply, senderId: this.id, receiverId: leaderId }); // 内部で AppendEntriesReplySent イベント
  }

  // コミットされたログを適用（シミュレーションではログ出力のみ）
  private applyCommittedLogs(): void {
    while (this.lastApplied < this.commitIndex) {
        this.lastApplied++;
        const entry = this.log[this.lastApplied];
        if (entry) { // ダミーエントリ(index 0)は除く
            console.log(`Node ${this.id}: Applying log index ${this.lastApplied}, Term ${entry.term}, Command: ${entry.command}`);
            this.logEvent('LogApplied', { index: this.lastApplied, term: entry.term, command: entry.command }); // イベントログ
        }
    }
  }

  private handleAppendEntriesReply(reply: AppendEntriesReply, followerId: string): void {
    // Leader 状態などは handleMessage でチェック済み
    if (reply.success) {
        // 成功した場合、nextIndexとmatchIndexを更新
        this.matchIndex[followerId] = reply.matchIndex ?? this.matchIndex[followerId]; // 応答のmatchIndexを優先
        this.nextIndex[followerId] = (reply.matchIndex ?? 0) + 1;
        // コミットを試みる
        this.tryCommit(); // 内部で CommitIndexAdvanced, LogApplied イベント
    } else {
        // 失敗した場合 (Termが古い or ログ不整合)
        if (reply.term > this.currentTerm) {
            // より新しいTermが見つかった場合 (ここには来ないはず？ handleMessageで処理される)
            this.becomeFollower(reply.term);
        } else {
            // ログの不整合 => nextIndexをデクリメントして再試行
            this.nextIndex[followerId] = Math.max(1, this.nextIndex[followerId] - 1);
            console.log(`Node ${this.id} (Leader): AppendEntries to ${followerId} failed. Decrementing nextIndex to ${this.nextIndex[followerId]}`);
            // TODO: ここで再送をトリガーすべきか？ 次のハートビートやコマンドで再送されるのを待つ？
            // すぐに再送する場合: this.sendAppendEntriesToNode(followerId);
        }
    }
  }

  private tryCommit(): void {
    const clusterSize = this.cluster?.nodes.length ?? 1;
    const majority = Math.floor(clusterSize / 2) + 1;

    // コミット可能なインデックスを探す (現在のTermのログのみ対象とするのがRaftの仕様)
    // ただし、単純化のためにここでは現在のTermに限定せず、matchIndexの過半数を見る
    let newCommitIndex = this.commitIndex;
    for (let N = this.getLastLogIndex(); N > this.commitIndex; N--) {
        // if (this.log[N]?.term !== this.currentTerm) continue; // 現在のTermのログのみチェック (厳密なRaft)

        let matchCount = 0;
        this.cluster?.nodes.forEach(node => {
            if ((this.matchIndex[node.id] ?? 0) >= N) {
                matchCount++;
            }
        });

        if (matchCount >= majority) {
            newCommitIndex = N;
            break; // 見つかったら終了
        }
    }

    if (newCommitIndex > this.commitIndex) {
        const oldCommitIndex = this.commitIndex;
        console.log(`Node ${this.id} (Leader) advancing commitIndex from ${this.commitIndex} to ${newCommitIndex}`);
        this.logEvent('CommitIndexAdvanced', { commitIndex: newCommitIndex, oldCommitIndex: oldCommitIndex }); // イベントログ
        this.commitIndex = newCommitIndex;
        this.applyCommittedLogs(); // 内部で LogApplied イベント
    }
  }

  // --- ログ関連ヘルパー ---

  private getLastLogIndex(): number {
    return this.log.length - 1;
  }

  private getLastLogTerm(): number {
    return this.log[this.getLastLogIndex()]?.term ?? 0;
  }

  // --- メッセージ送信ヘルパー ---
  private sendMessage(message: RaftMessage): void {
    // 送信イベントログ (より汎用的な形に変更)
    this.logEvent('MessageSent', { originalType: message.type, to: message.receiverId });
    /*
    let eventType = message.type;
    let details: Record<string, any> = { to: message.receiverId };
    if (message.type === 'RequestVote') {
        eventType = 'RequestVoteSent';
        details = { ...details, ...message.args };
    } else if (message.type === 'AppendEntries') {
        eventType = 'AppendEntriesSent';
        details = { ...details, ...message.args, entryCount: message.args.entries.length };
    } else if (message.type === 'RequestVoteReply') {
        eventType = 'RequestVoteReplySent';
        details = { ...details, ...message.reply };
    } else if (message.type === 'AppendEntriesReply') {
        eventType = 'AppendEntriesReplySent';
        details = { ...details, ...message.reply };
    }
    this.logEvent(eventType, details);
    */
    this.outgoingMessages.push(message);
  }

  // RequestVoteを全ノード（自分以外）に送信
  private sendRequestVoteToAll(): void {
    const lastLogIndex = this.getLastLogIndex();
    const lastLogTerm = this.getLastLogTerm();
    const args: RequestVoteArgs = {
      term: this.currentTerm,
      candidateId: this.id,
      lastLogIndex: lastLogIndex,
      lastLogTerm: lastLogTerm
    };
    // peerId に string 型を指定
    this.cluster?.getOtherNodeIds(this.id).forEach((peerId: string) => {
      this.sendMessage({ type: 'RequestVote', args, senderId: this.id, receiverId: peerId });
    });
  }

  // AppendEntriesを全ノード（自分以外）に送信 (heartbeat=trueならentriesは空)
  private sendAppendEntriesToAll(heartbeat: boolean = false): void {
    if (this.state !== 'Leader') return;

    this.cluster?.nodes.forEach(node => {
      if (node.id === this.id || node.state === 'Stopped') return; // 自分自身と停止ノードには送らない

      const followerId = node.id;
      const prevLogIndex = this.nextIndex[followerId] - 1;
      const prevLogTerm = this.log[prevLogIndex]?.term ?? 0; // 存在しない場合は 0
      const entriesToSend = heartbeat ? [] : this.log.slice(this.nextIndex[followerId]);

      const args: AppendEntriesArgs = {
        term: this.currentTerm,
        leaderId: this.id,
        prevLogIndex: prevLogIndex,
        prevLogTerm: prevLogTerm,
        entries: entriesToSend,
        leaderCommit: this.commitIndex
      };
      this.sendMessage({ type: 'AppendEntries', args, senderId: this.id, receiverId: followerId }); // 内部で AppendEntriesSent イベント
    });
  }
}
