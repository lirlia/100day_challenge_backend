'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { ChatMessageData } from '@/lib/types';

interface ChatWindowProps {
  messages: ChatMessageData[];
  onSendMessage: (message: string) => Promise<void>; // Promiseを返すようにして送信中の状態管理をしやすくする
  currentPlayerId: number | undefined;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onSendMessage, currentPlayerId }) => {
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || isSending) return;

    setIsSending(true);
    try {
      await onSendMessage(newMessage.trim());
      setNewMessage(''); // 送信成功したら入力欄をクリア
    } catch (error) {
      console.error('Failed to send message:', error);
      // UIにエラー表示 (例: alertやトースト)
      alert('メッセージの送信に失敗しました。');
    }
    setIsSending(false);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 bg-gray-700 rounded-md shadow-lg flex flex-col h-full font-mono">
      <h3 className="text-lg font-semibold mb-2 text-yellow-300 border-b border-gray-600 pb-1">チャット</h3>
      <div className="flex-1 overflow-y-auto mb-2 pr-2 space-y-2 text-sm">
        {messages.map((msg) => (
          <div key={msg.id} className={`p-2 rounded-md ${msg.playerId === currentPlayerId ? 'bg-blue-800 self-end ml-4' : 'bg-gray-600 self-start mr-4'}`}>
            <div className="flex justify-between items-baseline mb-0.5">
                <span className={`font-semibold ${msg.playerId === currentPlayerId ? 'text-blue-300' : 'text-green-300'}`}>{msg.playerName}</span>
                <span className="text-xs text-gray-400">{formatDate(msg.timestamp)}</span>
            </div>
            <p className="text-white break-words">{msg.message}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="メッセージを入力..."
          disabled={isSending}
          className="flex-1 p-2 bg-gray-600 border border-gray-500 rounded-md text-white placeholder-gray-400 focus:ring-1 focus:ring-yellow-500 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isSending}
          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? '送信中...' : '送信'}
        </button>
      </form>
    </div>
  );
};

export default ChatWindow;
