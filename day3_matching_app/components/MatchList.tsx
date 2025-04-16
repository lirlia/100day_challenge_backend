'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import MatchListItem from './MatchListItem';

// Type for the matched user data
type MatchedUser = {
  id: number;
  name: string;
  profileImageUrl: string | null;
};

export default function MatchList() {
  const searchParams = useSearchParams();
  const [matches, setMatches] = useState<MatchedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = searchParams.get('userId');

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      setError('ユーザーを選択してマッチリストを表示します。');
      setMatches([]); // Clear matches if no user is selected
      return;
    }

    const fetchMatches = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/users/${userId}/matches`);
        if (!response.ok) {
          throw new Error('Failed to fetch matches');
        }
        const data: MatchedUser[] = await response.json();
        setMatches(data);
      } catch (err: any) {
        console.error('Error fetching matches:', err);
        setError(err.message || 'Could not load matches.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatches();
  }, [userId]);

  if (isLoading) {
    return <div className="text-center p-6">マッチリストを読込中...</div>;
  }

  if (error) {
    return <div className="text-center p-6 text-red-600">エラー: {error}</div>;
  }

  if (matches.length === 0) {
    return <div className="text-center p-6 text-gray-500">まだマッチした相手がいません。スワイプを続けましょう！</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
      {matches.map((user) => (
        <MatchListItem key={user.id} user={user} />
      ))}
    </div>
  );
}
