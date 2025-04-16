'use client';

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import UserSwitcher from "./UserSwitcher";
import { Suspense } from 'react';

function UserSwitcherLoading() {
  return <div className="text-white">ユーザー読込中...</div>;
}

export default function Header() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId');
  const matchesHref = userId ? `/matches?userId=${userId}` : '/matches';
  const homeHref = userId ? `/?userId=${userId}` : '/';

  return (
    <header className="bg-white/80 backdrop-blur-sm text-pink-600 p-4 border-b border-pink-200 shadow-sm sticky top-0 z-10 w-full">
      <div className="flex flex-wrap justify-between items-center max-w-7xl mx-auto px-4">
        <Link href={homeHref} className="text-xl font-bold hover:text-pink-400 transition-colors mr-4 mb-2 sm:mb-0">Day3 マッチングアプリ</Link>
        <nav className="flex flex-wrap items-center space-x-4">
          <Link href={matchesHref} className="hover:text-pink-400 transition-colors mb-2 sm:mb-0">マッチ</Link>
          <Suspense fallback={<UserSwitcherLoading />}>
            <UserSwitcher />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
