'use client';

import { User } from '@/lib/types';
import Image from 'next/image';
import { useState } from 'react';

interface SidebarProps {
  users: User[];
  selectedUserId: number | null;
  onSelectUser: (userId: number) => void;
  getEmojiForUserId: (userId: number) => string;
  defaultEmoji: string;
}

export default function Sidebar({
  users,
  selectedUserId,
  onSelectUser,
  getEmojiForUserId,
  defaultEmoji,
}: SidebarProps) {
  const [showUserSelect, setShowUserSelect] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const selectedUser = users.find(user => user.id === selectedUserId);
  const selectedUserEmoji = selectedUserId ? getEmojiForUserId(selectedUserId) : defaultEmoji;

  return (
    <>
      {/* デスクトップ用サイドバー */}
      <aside className="w-80 p-3 sticky top-0 h-screen hidden md:block bg-gradient-to-b from-white to-brand-bg shadow-md border-r border-brand-light-gray">
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-blue bg-opacity-10 p-1 shadow-inner">
              <Image
                src="/bird-logo.svg"
                alt="Bird Logo"
                width={40}
                height={40}
              />
            </div>
          </div>
          <h1 className="text-xl font-bold mb-4 text-brand-black">Day4 Simple SNS</h1>
        </div>

        {/* メニュー項目 */}
        <nav className="mb-6">
          <ul className="space-y-1">
            <li>
              <a
                href="#"
                className={`flex items-center px-4 py-2 text-lg rounded-full transition-colors
                  ${true ? 'font-semibold text-brand-blue bg-brand-highlight shadow-sm' : 'text-brand-dark-gray hover:bg-brand-highlight'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                ホーム
              </a>
            </li>
            <li>
              <a
                href="#"
                className={`flex items-center px-4 py-2 text-lg rounded-full transition-colors
                  ${false ? 'font-semibold text-brand-blue bg-brand-highlight shadow-sm' : 'text-brand-dark-gray hover:bg-brand-highlight'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-4 text-brand-light-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                プロフィール
              </a>
            </li>
          </ul>
        </nav>

        {/* ユーザー選択 */}
        <div className="relative mt-auto border rounded-lg bg-gradient-to-br from-brand-highlight to-white p-2 shadow-sm">
          <button
            onClick={() => setShowUserSelect(!showUserSelect)}
            className="flex items-center w-full p-2 hover:bg-white rounded-md transition-colors group"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-xl font-bold shadow-sm mr-3">
              {selectedUserEmoji}
            </div>
            <div className="ml-3 text-left">
              <p className="font-bold">{selectedUser?.name || 'ユーザーを選択'}</p>
            </div>
            <div className="ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-brand-dark-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {showUserSelect && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-brand-extra-light-gray overflow-hidden z-10">
              {users.map(user => (
                <button
                  key={user.id}
                  className={`w-full text-left p-3 hover:bg-brand-highlight flex items-center
                    ${selectedUserId === user.id ? 'bg-brand-highlight font-bold' : ''}`}
                  onClick={() => {
                    onSelectUser(user.id);
                    setShowUserSelect(false);
                  }}
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-lg font-bold shadow-sm mr-2">
                    {getEmojiForUserId(user.id)}
                  </div>
                  <span className="font-medium">{user.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 投稿ボタン */}
        <button className="mt-4 w-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white font-bold py-3 rounded-full shadow-md transition-colors hover:from-brand-blue-dark hover:to-brand-blue-dark">
          投稿する
        </button>
      </aside>

      {/* モバイル用ヘッダー (md未満のビューポートで表示) */}
      <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-brand-blue to-brand-blue-dark z-20 border-b border-brand-light-gray md:hidden shadow-md">
        <div className="flex items-center p-3 justify-between">
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="p-2 rounded-full hover:bg-brand-blue-dark text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center">
            <Image
              src="/bird-logo.svg"
              alt="Bird Logo"
              width={30}
              height={30}
              className="invert"
            />
            <h1 className="text-lg font-bold ml-2 text-white">Day4 Simple SNS</h1>
          </div>

          <button
            onClick={() => setShowUserSelect(!showUserSelect)}
            className="p-1 bg-brand-highlight rounded-full"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-xl font-bold shadow-sm">
              {selectedUserEmoji}
            </div>
          </button>
        </div>

        {/* モバイル用ユーザー選択メニュー */}
        {showUserSelect && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-white rounded-lg shadow-lg border border-brand-extra-light-gray overflow-hidden z-30">
            {users.map(user => (
              <button
                key={user.id}
                className={`w-full text-left p-3 hover:bg-brand-highlight flex items-center
                  ${selectedUserId === user.id ? 'bg-brand-highlight font-bold' : ''}`}
                onClick={() => {
                  onSelectUser(user.id);
                  setShowUserSelect(false);
                }}
              >
                <div className="w-8 h-8 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-lg font-bold shadow-sm mr-2">
                  {getEmojiForUserId(user.id)}
                </div>
                <span className="font-medium">{user.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* モバイル用サイドメニュー */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowMobileMenu(false)}></div>
          <div className="absolute top-0 left-0 bottom-0 w-64 bg-gradient-to-b from-white to-brand-bg shadow-lg border-r border-brand-light-gray">
            <div className="p-4 flex flex-col h-full">
              <div className="mb-6">
                <h1 className="text-xl font-bold text-brand-black">Day4 Simple SNS</h1>
              </div>
              <nav className="mb-8">
                <ul className="space-y-2">
                  <li>
                    <a
                      href="#"
                      className={`flex items-center px-4 py-2 text-lg rounded-full transition-colors
                        ${true ? 'font-semibold text-brand-blue bg-brand-highlight shadow-sm' : 'text-brand-dark-gray hover:bg-brand-highlight'}`}
                      onClick={() => setShowMobileMenu(false)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      ホーム
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className={`flex items-center px-4 py-2 text-lg rounded-full transition-colors
                        ${false ? 'font-semibold text-brand-blue bg-brand-highlight shadow-sm' : 'text-brand-dark-gray hover:bg-brand-highlight'}`}
                      onClick={() => setShowMobileMenu(false)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      プロフィール
                    </a>
                  </li>
                </ul>
              </nav>

              <div className="mt-auto">
                <div className="p-3 border rounded-lg bg-gradient-to-br from-brand-highlight to-white mb-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-xl font-bold shadow-sm">
                        {selectedUserEmoji}
                      </div>
                      <div className="ml-3">
                        <p className="font-bold">{selectedUser?.name || '選択なし'}</p>
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-brand-dark-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                    </svg>
                  </div>
                </div>

                <button className="w-full bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white font-bold py-3 rounded-full shadow-md transition-colors hover:from-brand-blue-dark hover:to-brand-blue-dark">
                  投稿する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* モバイル用下部スペース確保 */}
      <div className="block h-14 md:hidden"></div>
    </>
  );
}
