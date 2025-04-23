'use client';

import React from 'react';
import { useRaft, EventFilterCategory } from '../context/RaftContext';
import { SimulationEvent } from '../lib/raft/types';

// イベントタイプをカテゴリーにマッピングするヘルパー関数
const getEventCategory = (eventType: string): EventFilterCategory | null => {
  switch (eventType) {
    case 'BecameLeader':
    case 'BecameFollower':
    case 'BecameCandidate':
    case 'StateChange': // StateChange も状態変化に含める
      return 'StateChange';
    case 'VoteGranted':
    case 'VoteRejected':
    case 'RequestVoteSent':
      return 'Voting';
    case 'AppendEntriesSent':
    case 'AppendEntriesSuccess':
    case 'AppendEntriesFailed':
    case 'CommitIndexAdvanced':
    case 'LogEntryAdded':
    case 'LogApplied':
      return 'LogReplication';
    case 'TimerStarted':
    case 'TimerElapsed':
    case 'ElectionTimeout': // ElectionTimeout もタイマーに含める
      return 'Timer';
    case 'MessageSent':
    case 'MessageDelivered':
    case 'MessageDropped':
    case 'RequestVoteReplySent': // 送信系もMessagingに入れる
    case 'AppendEntriesReplySent':
      return 'Messaging';
    case 'NodeAdded':
    case 'NodeRemoved':
    case 'NodeStopped':
    case 'NodeResumed':
    case 'ClusterInitialized':
    case 'NodesInitialized':
    case 'ClusterReset':
    case 'ClientCommandSent': // ClientCommand も Cluster 操作系に含める
    case 'ClientCommandFailed':
      return 'Cluster';
    // RequestVoteReceived や AppendEntriesReceived は結果（Vote/LogReplication）に含まれるため、ここでは分類しない（必要ならMessaging等に追加）
    default:
      console.warn(`Unknown event type for filtering: ${eventType}`);
      return null; // 不明なタイプは一旦表示しない or 'Other' カテゴリなど
  }
};

// イベントタイプに応じた説明的なメッセージを生成する関数
const formatEventDetails = (event: SimulationEvent): string => {
  const { type, details } = event;
  if (!details) return '';

  const nodeId = details.nodeId !== undefined ? `ノード ${details.nodeId}` : 'システム';
  const term = details.term !== undefined ? details.term : ''; // Term番号自体は取得しておく

  switch (type) {
    case 'ElectionTimeout':
      return `${nodeId}: 選挙タイムアウト、新しい選挙を開始します。`; // Term 表示を削除
    case 'BecameCandidate':
      return `${nodeId}: 候補者になりました。`; // Term 表示を削除
    case 'RequestVoteSent':
      return `${nodeId}: 投票依頼を ノード ${details.to} へ送信 (lastLogIndex: ${details.lastLogIndex}, lastLogTerm: ${details.lastLogTerm})。`; // Term 表示を削除
    case 'RequestVoteReceived':
      return `${nodeId}: 投票依頼を ノード ${details.candidateId} から受信 (候補者の lastLogIndex: ${details.lastLogIndex}, lastLogTerm: ${details.lastLogTerm})。`; // Term 表示を削除
    case 'VoteGranted':
      return `${nodeId}: 投票を ノード ${details.candidateId} へ許可。`; // Term 表示を削除
    case 'VoteRejected':
      const reasonJa = details.reason === 'term' ? 'Termが古い' : details.reason === 'voted' ? '投票済み' : details.reason === 'log' ? 'ログが古い' : '不明な理由';
      return `${nodeId}: 投票を ノード ${details.candidateId} へ拒否 (理由: ${reasonJa})。`; // Term 表示を削除
    case 'BecameLeader':
      return `👑 ${nodeId}: リーダーになりました。`; // Term 表示を削除
    case 'AppendEntriesSent':
      const entryCount = details.entries?.length || 0;
      const typeStrJa = entryCount > 0 ? `AppendEntries (${entryCount} 件)` : 'ハートビート';
      return `${nodeId}: ${typeStrJa} を ノード ${details.to} へ送信 (prevLogIndex: ${details.prevLogIndex}, prevLogTerm: ${details.prevLogTerm})。`; // Term 表示を削除
    case 'AppendEntriesReceived':
      const recvEntryCount = details.entries?.length || 0;
      const recvTypeStrJa = recvEntryCount > 0 ? `AppendEntries (${recvEntryCount} 件)` : 'ハートビート';
      return `${nodeId}: ${recvTypeStrJa} を リーダー ${details.leaderId} から受信 (リーダーの prevLogIndex: ${details.prevLogIndex}, prevLogTerm: ${details.prevLogTerm})。`; // Term 表示を削除
    case 'AppendEntriesSuccess':
      return `${nodeId}: AppendEntries への応答成功 (送信元: リーダー ${details.leaderId})。`; // Term 表示を削除
    case 'AppendEntriesFailed':
      const failReasonJa = details.reason === 'term' ? 'Termが古い' : 'ログ不一致';
      return `${nodeId}: AppendEntries の処理失敗 (送信元: リーダー ${details.leaderId}) (理由: ${failReasonJa})。`; // Term 表示を削除
    case 'BecameFollower':
      return `${nodeId}: フォロワーになりました (リーダー: ${details.leaderId !== undefined ? `ノード ${details.leaderId}` : '不明'})。`; // Term 表示を削除
    case 'CommitIndexAdvanced':
      return `${nodeId}: コミットインデックスが ${details.commitIndex} に進みました。`;
    case 'LogEntryAdded':
      return `${nodeId}: 新しいログエントリを追加 (Index: ${details.index}, Term: ${details.term}, コマンド: ${JSON.stringify(details.command)})。`; // Term は詳細に残す
    case 'StateChange':
      return `${nodeId}: 状態が ${details.newState} に変更されました。`; // Term 表示を削除
    case 'TimerStarted':
      const timerTypeJa = details.timerType === 'election' ? '選挙' : 'ハートビート';
      return `${nodeId}: ${timerTypeJa}タイマーを開始 (${details.duration}ms)。`;
    case 'TimerElapsed':
      const elapsedTimerTypeJa = details.timerType === 'election' ? '選挙' : 'ハートビート';
      return `${nodeId}: ${elapsedTimerTypeJa}タイマーが時間切れになりました。`;
    // デフォルトケースでメッセージ関連を表示
    case 'MessageSent':
      return `${nodeId}: メッセージ送信 (Type: ${details.originalType}, To: ${details.to})`; // Term 表示を削除
    case 'MessageDelivered':
      return `システム: メッセージ配送 (Type: ${details.type}, From: ${details.from}, To: ${details.to})`;
    case 'MessageDropped':
      return `システム: メッセージ破棄 (Type: ${details.type}, From: ${details.from}, To: ${details.to}, Reason: ${details.reason})`;
    // Node/Cluster イベント
    case 'NodeAdded': return `${nodeId}: ノード追加`;
    case 'NodeRemoved': return `${nodeId}: ノード削除`;
    case 'NodeStopped': return `${nodeId}: ノード停止`;
    case 'NodeResumed': return `${nodeId}: ノード再開`;
    case 'ClusterInitialized': return `システム: クラスター初期化 (Nodes: ${details.nodeCount})`;
    case 'NodesInitialized': return `システム: ノード初期化 (IDs: ${JSON.stringify(details.nodeIds)})`;
    case 'ClusterReset': return `システム: クラスターリセット (Nodes: ${details.newNodeCount})`;
    case 'ClientCommandSent': return `システム: コマンド送信 (Leader: ${details.leaderId}, Cmd: ${details.command})`;
    case 'ClientCommandFailed': return `システム: コマンド送信失敗 (Reason: ${details.reason})`;
    // LogApplied
    case 'LogApplied': return `${nodeId}: ログ適用 (Index: ${details.index}, Term: ${details.term}, Cmd: ${details.command})`; // Term は詳細に残す

    default:
      try {
        const detailsStrJa = Object.entries(details)
          .filter(([key]) => key !== 'nodeId' && key !== 'term')
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(', ');
        return `${nodeId}: ${type} - ${detailsStrJa || '詳細なし'}`;
      } catch (e) {
        return `${nodeId}: ${type} - [詳細エラー]`;
      }
  }
};

const EventLog: React.FC = () => {
  const { events, activeFilters } = useRaft();

  // イベントをフィルタリングし、タイムスタンプでソート
  const processedEvents = events
    .filter(event => {
      const category = getEventCategory(event.type);
      return category ? activeFilters.has(category) : true;
    })
    .sort((a, b) => a.timestamp - b.timestamp); // タイムスタンプで昇順ソート

  // Term が変わるごとに区切り線を入れるための reduce ロジック
  const logElements = processedEvents.reduce<React.ReactNode[]>((acc, event, index) => { // filteredEvents -> processedEvents
    const currentTerm = event.details?.term as number | undefined;
    const prevEvent = index > 0 ? processedEvents[index - 1] : null; // filteredEvents -> processedEvents
    const prevTerm = prevEvent?.details?.term as number | undefined;

    // Term が変化した場合 (初回以外、かつ Term が数値の場合) に区切りを追加
    if (
      index > 0 &&
      typeof currentTerm === 'number' &&
      typeof prevTerm === 'number' &&
      currentTerm !== prevTerm
    ) {
      acc.push(
        <div key={`term-separator-${currentTerm}-${index}`} className="my-2 pt-1 border-t border-dashed border-gray-400 text-center text-xs text-gray-500 dark:text-gray-400">
          --- Term {currentTerm} ---
        </div>
      );
    } else if (index === 0 && typeof currentTerm === 'number') {
      acc.push(
        <div key={`term-separator-${currentTerm}-start`} className="my-2 text-center text-xs text-gray-500 dark:text-gray-400">
          --- Term {currentTerm} ---
        </div>
      );
    }

    // 現在のイベントを追加
    acc.push(
      <p key={`${event.timestamp}-${index}`} className="mb-1 break-words">
        {formatEventDetails(event)}
      </p>
    );

    return acc;
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-lg font-semibold mb-3">Event Log</h2>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-y-auto text-sm font-mono">
        {logElements.length > 0 ? (
          logElements
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No events match filters.</p>
        )}
      </div>
    </div>
  );
};

export default EventLog;
