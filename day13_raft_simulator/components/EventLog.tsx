'use client';

import React from 'react';
import { useRaft } from '../context/RaftContext';
import { SimulationEvent } from '../lib/raft/types';

// イベントタイプに応じた説明的なメッセージを生成する関数
const formatEventDetails = (event: SimulationEvent): string => {
  const { type, details } = event;
  if (!details) return '';

  const nodeId = details.nodeId !== undefined ? `ノード ${details.nodeId}` : 'システム';
  const term = details.term !== undefined ? `(Term ${details.term})` : '';

  switch (type) {
    case 'ElectionTimeout':
      return `${nodeId} ${term}: 選挙タイムアウト、新しい選挙を開始します。`;
    case 'BecameCandidate':
      return `${nodeId}: 候補者になりました ${term}。`;
    case 'RequestVoteSent':
      return `${nodeId} ${term}: 投票依頼を ノード ${details.to} へ送信 (lastLogIndex: ${details.lastLogIndex}, lastLogTerm: ${details.lastLogTerm})。`;
    case 'RequestVoteReceived':
      return `${nodeId}: 投票依頼を ノード ${details.candidateId} から受信 (${term}) (候補者の lastLogIndex: ${details.lastLogIndex}, lastLogTerm: ${details.lastLogTerm})。`;
    case 'VoteGranted':
      return `${nodeId}: 投票を ノード ${details.candidateId} へ許可 (${term})。`;
    case 'VoteRejected':
      const reasonJa = details.reason === 'term' ? 'Termが古い' : details.reason === 'voted' ? '投票済み' : details.reason === 'log' ? 'ログが古い' : '不明な理由';
      return `${nodeId}: 投票を ノード ${details.candidateId} へ拒否 (${term}) (理由: ${reasonJa})。`;
    case 'BecameLeader':
      return `👑 ${nodeId}: リーダーになりました (${term})。`;
    case 'AppendEntriesSent':
      const entryCount = details.entries?.length || 0;
      const typeStrJa = entryCount > 0 ? `AppendEntries (${entryCount} 件)` : 'ハートビート';
      return `${nodeId} (${term}): ${typeStrJa} を ノード ${details.to} へ送信 (prevLogIndex: ${details.prevLogIndex}, prevLogTerm: ${details.prevLogTerm})。`;
    case 'AppendEntriesReceived':
      const recvEntryCount = details.entries?.length || 0;
      const recvTypeStrJa = recvEntryCount > 0 ? `AppendEntries (${recvEntryCount} 件)` : 'ハートビート';
      return `${nodeId}: ${recvTypeStrJa} を リーダー ${details.leaderId} から受信 (${term}) (リーダーの prevLogIndex: ${details.prevLogIndex}, prevLogTerm: ${details.prevLogTerm})。`;
    case 'AppendEntriesSuccess':
      return `${nodeId}: AppendEntries への応答成功 (送信元: リーダー ${details.leaderId}, ${term})。`;
    case 'AppendEntriesFailed':
      const failReasonJa = details.reason === 'term' ? 'Termが古い' : 'ログ不一致';
      return `${nodeId}: AppendEntries の処理失敗 (送信元: リーダー ${details.leaderId}, ${term}) (理由: ${failReasonJa})。`;
    case 'BecameFollower':
      return `${nodeId}: フォロワーになりました (${term}) (リーダー: ${details.leaderId !== undefined ? `ノード ${details.leaderId}` : '不明'})。`;
    case 'CommitIndexAdvanced':
      return `${nodeId}: コミットインデックスが ${details.commitIndex} に進みました。`;
    case 'LogEntryAdded':
      return `${nodeId}: 新しいログエントリを追加 (Index: ${details.index}, Term: ${details.term}, コマンド: ${JSON.stringify(details.command)})。`;
    case 'StateChange': // より汎用的な状態変化
      return `${nodeId}: 状態が ${details.newState} に変更されました (${term})。`;
    case 'TimerStarted':
      const timerTypeJa = details.timerType === 'election' ? '選挙' : 'ハートビート';
      return `${nodeId}: ${timerTypeJa}タイマーを開始 (${details.duration}ms)。`;
    case 'TimerElapsed':
      const elapsedTimerTypeJa = details.timerType === 'election' ? '選挙' : 'ハートビート';
      return `${nodeId}: ${elapsedTimerTypeJa}タイマーが時間切れになりました。`;
    // 他のイベントタイプも必要に応じて日本語化
    default:
      // 未処理のタイプに対するデフォルトフォーマット (日本語化)
      try {
        const detailsStrJa = Object.entries(details)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(', ');
        return `${nodeId} ${term}: ${type} - ${detailsStrJa}`;
      } catch (e) {
        return `${nodeId} ${term}: ${type} - [詳細エラー]`;
      }
  }
};

const EventLog: React.FC = () => {
  const { events } = useRaft();

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-lg font-semibold mb-3">Event Log</h2>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-y-auto text-sm font-mono max-h-96">
        {events && events.length > 0 ? (
          events.map((event: SimulationEvent, index: number) => (
            <p key={index} className="mb-1 break-words">
              {formatEventDetails(event)}
            </p>
          ))
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No events yet.</p>
        )}
      </div>
    </div>
  );
};

export default EventLog;
