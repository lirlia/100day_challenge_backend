"use client";

import { useState } from 'react';

interface UserSelectorProps {
  onSelect: (userId: string) => void;
}

const UserSelector: React.FC<UserSelectorProps> = ({ onSelect }) => {
  const [selectedUser, setSelectedUser] = useState('1');

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const userId = event.target.value;
    setSelectedUser(userId);
    onSelect(userId);
  };

  return (
    <div className="mb-4">
      <label htmlFor="user-select" className="block text-sm font-medium text-gray-700">
        Select User:
      </label>
      <select
        id="user-select"
        value={selectedUser}
        onChange={handleChange}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
      >
        <option value="1">User 1</option>
        <option value="2">User 2</option>
      </select>
    </div>
  );
};

export default UserSelector;
