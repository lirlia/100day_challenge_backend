'use client';

import React from 'react'; // useEffect, useState を削除
// import { User } from '@prisma/client'; // Prismaの型は直接使わない

// UserSwitcherで使用する最小限のUser型を定義
type SimpleUser = {
  id: number;
  name: string;
};

interface UserSwitcherProps {
  users: SimpleUser[]; // SimpleUser型を使用
  selectedUserId: number | null; // 親から渡された選択中のIDを直接使う
  onUserChange: (userId: number) => void;
}

const UserSwitcher: React.FC<UserSwitcherProps> = ({ users, selectedUserId, onUserChange }) => {
  // ローカルステート (useState) は不要
  // 初期ユーザー選択 (useEffect) は不要 (親で行う)

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newUserId = parseInt(event.target.value);
    // ローカルステートの更新は不要
    onUserChange(newUserId); // 親に変更を通知するだけ
  };

  // users が空の場合は何も表示しないか、ローディング表示などを検討
  if (!users || users.length === 0) {
    // ヘッダー内なので、ローディング表示はシンプルに null または空要素が良いかも
    return null;
    // return <div className="text-gray-500 text-sm">Loading...</div>;
  }

  return (
    // ヘッダーに合わせてマージンを調整 (ここでは削除)
    // <div className="mb-4">
    <div className="flex items-center">
      <label htmlFor="user-select" className="mr-2 text-sm font-medium text-gray-700 whitespace-nowrap">
        操作ユーザー:
      </label>
      <select
        id="user-select"
        value={selectedUserId ?? ''} // Propsで渡された selectedUserId を直接使用
        onChange={handleChange}
        // スタイルを少し調整 (padding, text size)
        className="p-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-pink-500 focus:border-pink-500 text-sm"
      >
        {/* SVG for dropdown arrow - hidden by default, shown via plugin or custom CSS if needed */}
        {/* <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">...</div> */}
        {/* <option value="" disabled>Select User</option> */}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} (ID: {user.id})
          </option>
        ))}
      </select>
    </div>
  );
};

export default UserSwitcher;
