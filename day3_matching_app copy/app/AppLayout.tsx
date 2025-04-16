'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import UserSwitcher from '@/components/UserSwitcher';
import { usePathname } from 'next/navigation';
import { useCurrentUser } from '@/context/CurrentUserContext';

// UserSwitcherから受け取るUser型
type SimpleUser = {
    id: number;
    name: string;
};

interface AppLayoutProps {
    users: SimpleUser[];
    children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ users, children }) => {
    const { currentUserId, setCurrentUserId } = useCurrentUser();
    const pathname = usePathname();

    // UserSwitcher からの変更を Context 経由で更新
    const handleUserChange = (userId: number) => {
        setCurrentUserId(userId);
        console.log(`Switched user to: ${userId} via Context`);
    };

    // 初期ユーザー設定 (Context のセッターを使用)
    useEffect(() => {
        if (currentUserId === null && users.length > 0) { // currentUserId が null の場合のみ設定
            setCurrentUserId(users[0].id);
            console.log(`Initial user set to: ${users[0].id} via Context`);
        }
    }, [users, currentUserId, setCurrentUserId]); // setCurrentUserId も依存配列に追加

    return (
        <div className="min-h-screen bg-gradient-to-br from-rose-100 via-purple-100 to-orange-100 font-sans">
            {/* Header */}
            <header className="bg-white shadow-md sticky top-0 z-10">
                <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                    <div className="flex items-center space-x-6">
                        {/* Logo/Brand */}
                        <Link href="/" className="flex items-center space-x-1 text-2xl font-bold text-pink-600 hover:text-pink-700 transition">
                            <span role="img" aria-label="heart">💖</span>
                            <span>MatchApp</span>
                        </Link>
                        {/* Navigation Links */}
                        <nav className="hidden md:flex space-x-4">
                            <Link href="/" className={`px-3 py-2 rounded-md text-sm font-medium transition ${pathname === '/' ? 'bg-pink-100 text-pink-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>スワイプ</Link>
                            <Link href="/matches" className={`px-3 py-2 rounded-md text-sm font-medium transition ${pathname === '/matches' ? 'bg-pink-100 text-pink-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>マッチリスト</Link>
                        </nav>
                    </div>
                    {/* User Switcher */}
                    <UserSwitcher
                        users={users}
                        selectedUserId={currentUserId}
                        onUserChange={handleUserChange}
                    />
                </div>
                {/* Mobile Navigation (Optional - can be added later if needed) */}
                {/* <nav className="md:hidden flex justify-around p-2 bg-gray-50 border-t border-gray-200"> ... </nav> */}
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6">
                {/* React.cloneElement を削除 */}
                {children}
            </main>

            {/* Footer */}
            <footer className="text-center py-6 text-gray-500 text-sm">
                © 2024 MatchApp Day 3
            </footer>
        </div>
    );
};

export default AppLayout;
