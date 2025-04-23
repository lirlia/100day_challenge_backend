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
  cluster: { nodes: RaftNode[]; getNodeById: (id: string) => RaftNode | undefined } | null = null; // クラスターへの参照 (Clusterクラスから設定)
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
  initialize(cluster: { nodes: RaftNode[]; getNodeById: (id: string) => RaftNode | undefined }): void {
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
      this.messageQueue.push(message);
      // console.log(`Node ${this.id} received message:`, message);
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
    this.state = 'Stopped';
    this.clearTimeouts();
    this.messageQueue = [];
    this.outgoingMessages = [];
    console.log(`Node ${this.id} stopped.`);
  }

  // ノードを再開する
  resume(): void {
    if (this.state === 'Stopped') {
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

  // 選挙タイムアウトをリセットして開始
  public resetElectionTimeout(): void {
    this.clearElectionTimeout();
    const timeout = Math.random() * (this.ELECTION_TIMEOUT_MAX - this.ELECTION_TIMEOUT_MIN) + this.ELECTION_TIMEOUT_MIN;
    this.electionTimeoutId = setTimeout(() => {
      if (this.state !== 'Stopped') {
        console.log(`Node ${this.id} election timeout! Starting election.`);
        this.becomeCandidate();
      }
    }, timeout);
    // console.log(`Node ${this.id} reset election timeout: ${timeout.toFixed(0)}ms`);
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
    this.sendAppendEntriesToAll(true); // 初回も送信
    this.heartbeatTimeoutId = setInterval(() => {
        if (this.state === 'Leader') {
            // console.log(`Node ${this.id} (Leader) sending heartbeat.`);
            this.sendAppendEntriesToAll(true);
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
    // 共通のTermチェック
    let newTermDetected = false;
    const messageTerm = message.type === 'RequestVote' || message.type === 'AppendEntries'
        ? message.args.term
        : message.reply.term;

    if (messageTerm > this.currentTerm) {
        console.log(`Node ${this.id} detected higher term ${messageTerm} (current: ${this.currentTerm}). Becoming Follower.`);
        this.becomeFollower(messageTerm);
        newTermDetected = true;
    }

    // 停止中は何もしない
    if (this.state === 'Stopped') return;

    // メッセージタイプに応じた処理
    switch (message.type) {
      case 'RequestVote':
        // 新しいTermが検出された場合、新しいTermで処理を継続
        this.handleRequestVote(message.args, message.senderId);
        break;
      case 'RequestVoteReply':
        // 自分より低いTermからの返信は無視（ならびに古い選挙の結果も無視）
        if (message.reply.term === this.currentTerm && this.state === 'Candidate') {
            this.handleRequestVoteReply(message.reply, message.senderId);
        }
        break;
      case 'AppendEntries':
        // 自分より低いTermからのリクエストは拒否
        if (message.args.term < this.currentTerm) {
            this.sendAppendEntriesReply(message.senderId, false); // 旧TermのLeaderかもしれないので返信する
        } else {
            // 新しいTermが検出された場合、becomeFollowerが呼ばれているのでFollowerとして処理
            this.handleAppendEntries(message.args, message.senderId);
        }
        break;
      case 'AppendEntriesReply':
        // 自分より低いTermからの返信は無視
        if (message.reply.term === this.currentTerm && this.state === 'Leader') {
            this.handleAppendEntriesReply(message.reply, message.senderId);
        }
        break;
    }
  }

  // --- 状態遷移メソッド ---

  private becomeFollower(newTerm: number): void {
    const oldState = this.state;
    this.state = 'Follower';
    this.currentTerm = newTerm;
    this.votedFor = null; // 新しいtermではまだ誰にも投票していない
    this.votesReceived.clear();
    this.clearHeartbeatTimeout(); // Leader/Candidateではなくなるのでハートビート停止
    this.resetElectionTimeout(); // Followerになったので選挙タイマー開始

    if (oldState === 'Leader') {
        console.log(`Node ${this.id} stepping down from Leader to Follower.`);
    } else if (oldState === 'Candidate') {
        console.log(`Node ${this.id} abandoning candidacy, becoming Follower.`);
    }
  }

  private becomeCandidate(): void {
    if (this.state === 'Stopped') return;
    this.state = 'Candidate';
    this.currentTerm++; // 新しい選挙を開始するためにtermをインクリメント
    this.votedFor = this.id; // 自分自身に投票
    this.votesReceived.clear();
    this.votesReceived.add(this.id); // 自分の票を追加
    console.log(`Node ${this.id} became Candidate for term ${this.currentTerm}. Voted for self.`);

    this.clearHeartbeatTimeout(); // リーダーではない
    this.resetElectionTimeout(); // 新しい選挙タイマーを開始

    // 他のノードにRequestVote RPCを送信
    this.sendRequestVoteToAll();

    // すぐに過半数チェック (ノードが1つの場合など)
    this.checkElectionWin();
  }

  private becomeLeader(): void {
    if (this.state !== 'Candidate') return; // CandidateからのみLeaderになれる

    this.state = 'Leader';
    this.votedFor = null; // Leaderは投票しない
    this.votesReceived.clear();
    this.clearElectionTimeout(); // Leaderは選挙タイムアウトしない
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
    this.startHeartbeat();

    // （オプション）No-opエントリをログに追加してコミットを進める
    // this.receiveCommand("leader-init");
  }

  // --- RPC ハンドラ ---

  private handleRequestVote(args: RequestVoteArgs, candidateId: string): void {
    let voteGranted = false;

    // 1. 返信するtermは現在のterm (もしargs.term > currentTermなら上でFollowerになっている)
    const replyTerm = this.currentTerm;

    // 2. args.term < currentTerm なら投票しない (これはhandleMessageでチェック済)
    if (args.term < this.currentTerm) {
        voteGranted = false;
        console.log(`Node ${this.id} rejected vote request from ${candidateId} (term ${args.term} < ${this.currentTerm})`);
    } else if (this.votedFor === null || this.votedFor === candidateId) {
        // 3. 投票先がnullか、既に同じ候補者に投票済みの場合
        // 4. 候補者のログが自分と同じか新しいかチェック
        const lastLogTerm = this.getLastLogTerm();
        const lastLogIndex = this.getLastLogIndex();
        if (args.lastLogTerm > lastLogTerm || (args.lastLogTerm === lastLogTerm && args.lastLogIndex >= lastLogIndex)) {
            console.log(`Node ${this.id} granted vote to ${candidateId} for term ${args.term}`);
            voteGranted = true;
            this.votedFor = candidateId; // 投票先を記録
            this.resetElectionTimeout(); // 投票したのでタイマーリセット
        } else {
            console.log(`Node ${this.id} rejected vote request from ${candidateId} (log outdated: candidate [${args.lastLogTerm}, ${args.lastLogIndex}] vs self [${lastLogTerm}, ${lastLogIndex}])`);
        }
    } else {
        // 既に他の候補者に投票済み
        console.log(`Node ${this.id} rejected vote request from ${candidateId} (already voted for ${this.votedFor} in term ${this.currentTerm})`);
    }

    // 応答を送信
    const reply: RequestVoteReply = { term: replyTerm, voteGranted };
    this.sendMessage({ type: 'RequestVoteReply', reply, senderId: this.id, receiverId: candidateId });
  }

  private handleRequestVoteReply(reply: RequestVoteReply, senderId: string): void {
    // Candidate 状態でのみ処理 (handleMessageでチェック済)
    console.log(`Node ${this.id} (Candidate) received vote reply from ${senderId}: ${reply.voteGranted}`);

    if (reply.voteGranted) {
      this.votesReceived.add(senderId);
      this.checkElectionWin();
    }
    // 拒否された場合の term チェックは handleMessage で行っている
  }

  private checkElectionWin(): void {
    if (this.state !== 'Candidate') return;

    const clusterSize = this.cluster?.nodes.filter(n => n.state !== 'Stopped').length ?? 1;
    const majority = Math.floor(clusterSize / 2) + 1;

    if (this.votesReceived.size >= majority) {
      console.log(`Node ${this.id} (Candidate) received majority votes (${this.votesReceived.size}/${clusterSize}). Becoming Leader.`);
      this.becomeLeader();
    }
  }

  private handleAppendEntries(args: AppendEntriesArgs, leaderId: string): void {
    let success = false;
    let matchIndex: number | undefined = undefined;

    // 1. term < currentTerm なら失敗応答 (handleMessageでチェック済、返信は別途行う)
    if (args.term < this.currentTerm) {
        this.sendAppendEntriesReply(leaderId, false);
        return;
    }

    // この時点で args.term >= this.currentTerm
    // args.term > this.currentTerm の場合は handleMessage で becomeFollower が呼ばれている

    // どんな有効な AppendEntries でも Follower/Candidate は Leader を認識し、Follower になる
    if (this.state === 'Candidate') {
        console.log(`Node ${this.id} (Candidate) received AppendEntries from new leader ${leaderId}. Becoming Follower.`);
        this.becomeFollower(args.term); // Candidate -> Follower
    }

    this.resetElectionTimeout(); // 有効なLeaderからのメッセージなのでタイマーリセット

    // 2. prevLogIndex/prevLogTerm のチェック
    const prevLogEntry = this.log[args.prevLogIndex];
    if (!prevLogEntry || prevLogEntry.term !== args.prevLogTerm) {
        // ログが一致しない
        console.log(`Node ${this.id} rejected AppendEntries from ${leaderId}. Log mismatch at index ${args.prevLogIndex}. Expected term ${args.prevLogTerm}, got ${prevLogEntry?.term}. Log length: ${this.log.length}`);
        // 最適化: 応答に現在のログの最終インデックスを含める (ただし、実装は少し複雑になるので今回は省略)
        // matchIndex = this.getLastLogIndex(); // これは単純すぎるかも。衝突したTermの最初のIndexを探す必要がある。
        success = false;
    } else {
        // ログが一致した
        success = true;
        let index = args.prevLogIndex + 1;
        let entryIndex = 0;

        // 3. 既存のエントリが新しいエントリと衝突する場合、既存のエントリとそれ以降をすべて削除
        while (index < this.log.length && entryIndex < args.entries.length) {
            if (this.log[index].term !== args.entries[entryIndex].term) {
                console.log(`Node ${this.id} deleting conflicting log entries from index ${index}`);
                this.log.splice(index);
                break;
            }
            index++;
            entryIndex++;
        }

        // 4. 新しいエントリがあれば追加
        if (entryIndex < args.entries.length) {
            const newEntries = args.entries.slice(entryIndex);
            console.log(`Node ${this.id} appending ${newEntries.length} new entries from index ${index}.`);
            this.log.push(...newEntries);
            // console.log(`Node ${this.id} log is now:`, JSON.stringify(this.log));
        }

        matchIndex = this.getLastLogIndex(); // 成功した場合、最後に一致した（または追加した）インデックス

        // 5. leaderCommit > commitIndex なら commitIndex を更新
        if (args.leaderCommit > this.commitIndex) {
            this.commitIndex = Math.min(args.leaderCommit, this.getLastLogIndex());
            console.log(`Node ${this.id} updated commitIndex to ${this.commitIndex}`);
            // TODO: 実際にステートマシンに適用する処理 (lastAppliedを進める)
            this.applyCommittedLogs();
        }
    }

    this.sendAppendEntriesReply(leaderId, success, matchIndex);
  }

  // AppendEntries への応答を送信するヘルパー
  private sendAppendEntriesReply(leaderId: string, success: boolean, matchIndex?: number): void {
    const reply: AppendEntriesReply = { term: this.currentTerm, success, matchIndex };
    this.sendMessage({ type: 'AppendEntriesReply', reply, senderId: this.id, receiverId: leaderId });
  }

  // コミットされたログを適用（シミュレーションではログ出力のみ）
  private applyCommittedLogs(): void {
      while(this.lastApplied < this.commitIndex) {
          this.lastApplied++;
          const entry = this.log[this.lastApplied];
          if (entry) { // ダミーエントリ(index 0)は適用しない想定だが念のため
            console.log(`Node ${this.id} applying log index ${this.lastApplied}: command '${entry.command}' (term ${entry.term})`);
          } else {
            console.error(`Node ${this.id} tried to apply log index ${this.lastApplied} but entry not found!`);
          }
          // ここで実際のアプリケーションロジックを実行する
      }
  }


  private handleAppendEntriesReply(reply: AppendEntriesReply, followerId: string): void {
    // Leader状態でのみ処理 (handleMessageでチェック済)
    // console.log(`Node ${this.id} (Leader) received AppendEntries reply from ${followerId}: success=${reply.success}, term=${reply.reply.term}, matchIndex=${reply.reply.matchIndex}`);

    if (reply.success) {
      // 成功した場合: nextIndex と matchIndex を更新
      // AppendEntriesArgs には prevLogIndex と entries が含まれていたはず
      // 成功したので、送信した最後のindexがmatchしたはず
      const lastSentIndex = this.nextIndex[followerId] - 1; // これは送信試行したindexなので、必ずしも正しくない
      // matchIndexは、フォロワーがリーダーと一致していることが確認できた最大のインデックス
      // 応答でmatchIndexが返ってきた場合はそれを使う（今回は成功時なので、最後に送信したエントリまで一致したはず）
      // 送信したエントリ数を考慮して更新する
      const sentEntriesCount = this.log.length - this.nextIndex[followerId]; // これは間違い。RPC実行時のログの長さを使うべき
      // より単純には、成功したら nextIndex を matchIndex + 1 にする。matchIndexは最後に成功したログエントリのインデックス。
      // AppendEntriesArgsのprevLogIndex + entries.length が matchIndex になるはず
      const assumedMatchIndex = reply.matchIndex ?? this.matchIndex[followerId]; // フォロワーが返したmatchIndexを信用する (なければ前回のを維持)
      const assumedNextIndex = assumedMatchIndex + 1;
      this.matchIndex[followerId] = Math.max(this.matchIndex[followerId] ?? 0, assumedMatchIndex);
      this.nextIndex[followerId] = Math.max(this.nextIndex[followerId] ?? 0, assumedNextIndex);

      // console.log(`Node ${this.id} (Leader) updated for ${followerId}: matchIndex=${this.matchIndex[followerId]}, nextIndex=${this.nextIndex[followerId]}`);

      // commitIndexの更新を試みる
      this.tryCommit();
    } else {
      // 失敗した場合: nextIndex をデクリメントして再試行
      // 最適化：reply.matchIndexが返されていれば、それに基づいてnextIndexをより効率的に調整できる
      if (reply.matchIndex !== undefined) {
          // フォロワーが一致するインデックスを教えてくれた場合
          this.nextIndex[followerId] = reply.matchIndex + 1;
      } else {
          // 単純にデクリメント（非効率な場合あり）
          this.nextIndex[followerId] = Math.max(1, (this.nextIndex[followerId] ?? 1) - 1);
      }
      console.log(`Node ${this.id} (Leader) AppendEntries failed for ${followerId}. Decreasing nextIndex to ${this.nextIndex[followerId]}.`);
      // TODO: すぐに再送する？ Cluster側で制御？
      // 今回は次のHeartbeat/コマンド受信時に再送されることを期待
    }
  }

  // commitIndex を更新できるか試みる (Leader用)
  private tryCommit(): void {
      if (this.state !== 'Leader') return;

      const clusterSize = this.cluster?.nodes.filter(n => n.state !== 'Stopped').length ?? 1;
      const majority = Math.floor(clusterSize / 2) + 1;

      // commitIndexより大きいindexから順にチェック
      for (let N = this.getLastLogIndex(); N > this.commitIndex; N--) {
          // そのindexのログがLeader自身のTermである必要がある
          if (this.log[N]?.term === this.currentTerm) {
              let matchCount = 0;
              // matchIndex[i] >= N となるノードの数を数える
              this.cluster?.nodes.forEach(node => {
                  if (node.state !== 'Stopped' && (this.matchIndex[node.id] ?? 0) >= N) {
                      matchCount++;
                  }
              });

              // 過半数が一致していればコミット
              if (matchCount >= majority) {
                  console.log(`Node ${this.id} (Leader) committing index ${N} (majority match: ${matchCount}/${clusterSize})`);
                  this.commitIndex = N;
                  this.applyCommittedLogs(); // Leader自身も適用
                  // 一度コミットインデックスを更新したらループを抜ける
                  break;
              }
          }
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
    // 停止中は送信しない
    if (this.state !== 'Stopped') {
        this.outgoingMessages.push(message);
    }
  }

  // RequestVoteを全ノード（自分以外）に送信
  private sendRequestVoteToAll(): void {
    if (!this.cluster) return;
    const args: RequestVoteArgs = {
      term: this.currentTerm,
      candidateId: this.id,
      lastLogIndex: this.getLastLogIndex(),
      lastLogTerm: this.getLastLogTerm(),
    };
    this.cluster.nodes.forEach(node => {
      if (node.id !== this.id && node.state !== 'Stopped') {
        console.log(`Node ${this.id} (Candidate) sending RequestVote to ${node.id}`);
        this.sendMessage({ type: 'RequestVote', args, senderId: this.id, receiverId: node.id });
      }
    });
  }

  // AppendEntriesを全ノード（自分以外）に送信 (heartbeat=trueならentriesは空)
  private sendAppendEntriesToAll(heartbeat: boolean = false): void {
    if (!this.cluster || this.state !== 'Leader') return;

    this.cluster.nodes.forEach(node => {
      if (node.id !== this.id && node.state !== 'Stopped') {
        const prevLogIndex = (this.nextIndex[node.id] ?? 1) - 1;
        const prevLogTerm = this.log[prevLogIndex]?.term ?? 0;
        const entries = heartbeat ? [] : this.log.slice(prevLogIndex + 1);

        // if (!heartbeat && entries.length > 0) {
        //     console.log(`Node ${this.id} (Leader) sending ${entries.length} entries (start index ${prevLogIndex + 1}) to ${node.id}. Prev=[${prevLogIndex}, ${prevLogTerm}]`);
        // } else if (heartbeat) {
        //     // console.log(`Node ${this.id} (Leader) sending heartbeat to ${node.id}. Prev=[${prevLogIndex}, ${prevLogTerm}]`);
        // }

        const args: AppendEntriesArgs = {
          term: this.currentTerm,
          leaderId: this.id,
          prevLogIndex,
          prevLogTerm,
          entries,
          leaderCommit: this.commitIndex,
        };
        this.sendMessage({ type: 'AppendEntries', args, senderId: this.id, receiverId: node.id });
      }
    });
  }
}
