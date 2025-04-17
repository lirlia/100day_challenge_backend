'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [userId, setUserId] = useState('');
  const [peerId, setPeerId] = useState('');
  const router = useRouter();

  const handleStartCall = () => {
    if (userId && peerId && userId !== peerId) {
      router.push(`/chat?userId=${userId}&peerId=${peerId}`);
    } else if (userId === peerId) {
        alert('自分自身とは通話できません。');
    } else {
        alert('ユーザーIDと相手のIDを入力してください。');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">WebRTC Video Chat</h1>
        <div className="mb-4">
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
            あなたのユーザーID
          </label>
          <input
            type="text"
            id="userId"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="例: user1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="mb-6">
          <label htmlFor="peerId" className="block text-sm font-medium text-gray-700 mb-1">
            相手のユーザーID
          </label>
          <input
            type="text"
            id="peerId"
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            placeholder="例: user2"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={handleStartCall}
          disabled={!userId || !peerId}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          通話開始
        </button>
      </div>
    </div>
  );
}
