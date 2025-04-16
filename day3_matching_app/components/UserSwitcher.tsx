'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image'; // Import Image
// import type { User } from '@prisma/client'; // Removed unused import

// Define a simpler type for the user data needed in this component
type SelectableUser = {
  id: number;
  name: string;
  profileImageUrl: string | null; // Add profileImageUrl
};

function InitialIcon({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-pink-200 via-blue-200 to-orange-200 text-pink-600 font-bold text-lg shadow-md">
      {initial}
    </span>
  );
}

export default function UserSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname(); // Get current pathname
  const [users, setUsers] = useState<SelectableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserProfileImageUrl, setSelectedUserProfileImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch users from the API
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        const data: SelectableUser[] = await response.json();
        setUsers(data);

        // Set initial selected user from URL or default to the first user
        const currentUserId = searchParams.get('userId');
        let initialUser: SelectableUser | undefined;

        if (currentUserId && data.some(user => user.id.toString() === currentUserId)) {
          setSelectedUserId(currentUserId);
          initialUser = data.find(user => user.id.toString() === currentUserId);
        } else if (data.length > 0) {
          const defaultUserId = data[0].id.toString();
          setSelectedUserId(defaultUserId);
          initialUser = data[0];
          // Update URL only if no userId was present or it was invalid, preserving current path
          const currentPathUserId = searchParams.get('userId');
          if (!currentPathUserId || !data.some(u => u.id.toString() === currentPathUserId)){
            router.push(`${pathname}?userId=${defaultUserId}`);
          }
        }

        // Set initial image URL
        setSelectedUserProfileImageUrl(initialUser?.profileImageUrl || null);

      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Update URL when user selection changes, preserving pathname
  useEffect(() => {
    const currentUser = users.find(user => user.id.toString() === selectedUserId);
    setSelectedUserProfileImageUrl(currentUser?.profileImageUrl || null);

    if (selectedUserId && searchParams.get('userId') !== selectedUserId) {
      // Push with current pathname and new userId
      router.push(`${pathname}?userId=${selectedUserId}`);
    }
    // Intentionally not adding searchParams or pathname to dependency array to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, router, users]);

  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedUserId(event.target.value);
  };

  if (isLoading) {
    return <div className="text-pink-500 font-mplus">ユーザー読込中...</div>;
  }

  if (users.length === 0) {
    return <div className="text-pink-500 font-mplus">ユーザーが見つかりません。</div>;
  }

  const selectedUserName = users.find(u => u.id.toString() === selectedUserId)?.name || '';

  return (
    <div className="relative flex items-center space-x-2 font-mplus">
      {/* 選択中ユーザーの画像 or イニシャルアイコン */}
      <div className="w-8 h-8 rounded-full overflow-hidden shadow-md border-2 border-white flex-shrink-0">
        {selectedUserProfileImageUrl ? (
          <Image
            src={selectedUserProfileImageUrl}
            alt={selectedUserName}
            width={32}
            height={32}
            className="object-cover w-full h-full"
          />
        ) : (
          <InitialIcon name={selectedUserName} />
        )}
      </div>

      {/* ドロップダウン */}
      <div className="relative">
        <select
          value={selectedUserId}
          onChange={handleUserChange}
          className="bg-gradient-to-br from-pink-100 via-blue-100 to-orange-100 text-pink-600 font-bold py-2 pl-4 pr-10 rounded-full shadow-md border-2 border-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all text-base appearance-none min-w-[120px] hover:border-pink-400 cursor-pointer"
          aria-label="ユーザー選択"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id} className="text-pink-600 font-bold">
              {user.name} (ID: {user.id})
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-pink-400">
          <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
