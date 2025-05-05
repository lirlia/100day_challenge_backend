'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// Basic Neumorphism button style (can be extracted to a utility/component)
const neumorphicButtonBase = "px-4 py-2 rounded-lg shadow-neumorphic hover:shadow-neumorphic-inset focus:outline-none transition-all duration-200 ease-in-out";
const neumorphicActive = "shadow-neumorphic-inset text-blue-600"; // Style for active button

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState('user1'); // Default user

  // Update currentUser state when query param changes
  useEffect(() => {
    const user = searchParams.get('userId') || 'user1';
    setCurrentUser(user);
  }, [searchParams]);

  const switchUser = (newUser: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('userId', newUser);
    const search = current.toString();
    const query = search ? `?${search}` : '';
    router.push(`${pathname}${query}`);
  };

  return (
    <header className="bg-gray-200 p-4 flex justify-end items-center space-x-2">
      <span className="text-sm mr-2">Current User:</span>
      <button
        onClick={() => switchUser('user1')}
        className={`${neumorphicButtonBase} ${currentUser === 'user1' ? neumorphicActive : 'bg-gray-200 text-gray-700'}`}
      >
        User 1
      </button>
      <button
        onClick={() => switchUser('user2')}
        className={`${neumorphicButtonBase} ${currentUser === 'user2' ? neumorphicActive : 'bg-gray-200 text-gray-700'}`}
      >
        User 2
      </button>
      {/* Add more users if needed */}
    </header>
  );
}
