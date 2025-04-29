import { create } from 'zustand';
import { User } from '@prisma/client'; // Prismaが生成する型を利用

interface UserState {
  currentUser: User | null;
  availableUsers: User[];
  setCurrentUser: (user: User | null) => void;
  setAvailableUsers: (users: User[]) => void;
  fetchAvailableUsers: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: null,
  availableUsers: [],
  setCurrentUser: (user) => set({ currentUser: user }),
  setAvailableUsers: (users) => set({ availableUsers: users }),
  fetchAvailableUsers: async () => {
    try {
      // ここではAPIを叩かず、シードデータに基づいた固定ユーザーリストを使う
      // 本来は /api/users などから取得する
      const users: User[] = [
        { id: 1, name: 'Alice', createdAt: new Date(), updatedAt: new Date() },
        { id: 2, name: 'Bob', createdAt: new Date(), updatedAt: new Date() },
        // 必要に応じて他のユーザーを追加
      ];
      set({ availableUsers: users });
      // デフォルトユーザーをセット (例: 最初のユーザー)
      if (users.length > 0) {
        set({ currentUser: users[0] });
      }
    } catch (error) {
      console.error("Failed to fetch available users:", error);
      set({ availableUsers: [], currentUser: null });
    }
  },
}));
