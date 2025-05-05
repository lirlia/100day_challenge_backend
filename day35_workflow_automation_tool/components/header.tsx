'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/store';

export default function Header() {
  const {
    users,
    selectedUserId,
    isLoading,
    error,
    setSelectedUserId,
    fetchUsers,
  } = useUserStore();

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = parseInt(event.target.value, 10);
    setSelectedUserId(isNaN(userId) ? null : userId);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-gray-800 dark:text-white">
          Day35 - Workflow Automation
        </Link>
        <div className="flex items-center space-x-2">
          <label htmlFor="user-select" className="text-sm font-medium text-gray-600 dark:text-gray-300">Current User:</label>
          {isLoading && <span className="text-sm text-gray-500">Loading...</span>}
          {error && <span className="text-sm text-red-500">Error loading users</span>}
          {!isLoading && !error && (
            <select
              id="user-select"
              value={selectedUserId ?? ''}
              onChange={handleUserChange}
              disabled={users.length === 0}
              className="block w-full pl-3 pr-8 py-1.5 text-base border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Select current user"
            >
              {users.length === 0 && <option value="">No users found</option>}
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </header>
  );
}
