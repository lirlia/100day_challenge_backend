'use client';

import Link from 'next/link';
import { useUserStore } from '@/lib/store';
import { useEffect } from 'react';

export default function Header() {
    // Zustand ストアからユーザー情報と選択関数を取得 (関数名を修正)
    const { users, selectedUserId, setSelectedUserId, fetchUsers } = useUserStore();

    // コンポーネントマウント時にユーザーリストを取得
    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const userId = parseInt(event.target.value, 10);
        // 正しい関数名を使用
        setSelectedUserId(isNaN(userId) ? null : userId);
    };

    return (
        <header className="sticky top-0 z-10 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg shadow-sm dark:shadow-gray-800/50 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* アプリタイトル */}
                    <div className="flex-shrink-0">
                        <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200">
                             Day35 - ワークフロー自動化
                        </Link>
                    </div>

                    {/* ユーザー選択ドロップダウン */}
                    <div className="flex items-center">
                        <label htmlFor="user-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
                            現在のユーザー:
                        </label>
                        <select
                            id="user-select"
                            value={selectedUserId ?? ''} // nullish coalescing for initial load
                            onChange={handleUserChange}
                            disabled={users.length === 0}
                            className="block w-full pl-3 pr-8 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 dark:disabled:bg-gray-700 appearance-none"
                            aria-label="現在のユーザーを選択"
                        >
                            {/* ユーザーリストが空の場合のプレースホルダー */}
                            {users.length === 0 && <option value="">読み込み中...</option>}

                            {/* ユーザーリストをオプションとして表示 */}
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </header>
    );
}
