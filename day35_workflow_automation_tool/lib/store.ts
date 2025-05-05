'use client';

import { create } from 'zustand';

export interface User {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
}

interface UserState {
  users: User[];
  selectedUserId: number | null;
  isLoading: boolean;
  error: string | null;
  setUsers: (users: User[]) => void;
  setSelectedUserId: (userId: number | null) => void;
  fetchUsers: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  selectedUserId: null,
  isLoading: false,
  error: null,
  setUsers: (users) => set({ users }),
  setSelectedUserId: (userId) => set({ selectedUserId: userId }),
  fetchUsers: async () => {
    if (get().users.length > 0 || get().isLoading) return; // Avoid redundant fetches
    set({ isLoading: true, error: null });
    try {
      console.log('[Store] Fetching users...');
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`);
      }
      const users = await response.json() as User[];
      console.log('[Store] Users fetched successfully:', users);
      set({ users, isLoading: false });
      // Select the first user by default if none is selected
      if (users.length > 0 && get().selectedUserId === null) {
        set({ selectedUserId: users[0].id });
        console.log('[Store] Automatically selected first user:', users[0]);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching users';
      console.error('[Store] Error fetching users:', errorMessage);
      set({ error: errorMessage, isLoading: false });
    } finally {
        // Ensure isLoading is set to false even if component unmounts during fetch
        set({ isLoading: false });
    }
  },
}));
