'use client';

import { useState } from 'react';

interface UserSelectorProps {
  currentUserId: string;
  onUserChange: (userId: string) => void;
}

const users = [
  { id: 'user1', name: '田中太郎' },
  { id: 'user2', name: '佐藤花子' },
  { id: 'user3', name: '山田次郎' },
];

export default function UserSelector({ currentUserId, onUserChange }: UserSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentUser = users.find(user => user.id === currentUserId) || users[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <span className="text-lg">👤</span>
        <span>{currentUser.name}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10">
          {users.map((user) => (
            <button
              key={user.id}
              onClick={() => {
                onUserChange(user.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg ${user.id === currentUserId
                  ? 'bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200'
                  : 'text-gray-700 dark:text-gray-200'
                }`}
            >
              <span className="text-lg mr-2">👤</span>
              {user.name}
              {user.id === currentUserId && (
                <span className="ml-2 text-indigo-500">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
