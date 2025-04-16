'use client'; // MatchList fetches data client-side based on userId

import MatchList from '@/components/MatchList';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function MatchesPageContent() {
    const searchParams = useSearchParams();
    const userId = searchParams.get('userId');

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">マッチリスト</h1>
            {!userId ? (
                <p className="text-gray-500">ヘッダーからユーザーを選択してマッチリストを表示してください。</p>
            ) : (
                <MatchList />
            )}
        </div>
    );
}

export default function MatchesPage() {
  // We need Suspense here because UserSwitcher in the layout might suspend,
  // and MatchList relies on the userId from the URL potentially set by UserSwitcher.
  // Also, MatchList itself fetches data client-side.
  return (
    <Suspense fallback={<div>マッチリストを読込中...</div>}>
      <MatchesPageContent />
    </Suspense>
  );
}
