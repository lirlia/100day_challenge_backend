'use client';

import React, { createContext, useContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';

interface CurrentUserContextType {
  currentUserId: number | null;
  setCurrentUserId: Dispatch<SetStateAction<number | null>>;
}

const CurrentUserContext = createContext<CurrentUserContextType | undefined>(undefined);

export const CurrentUserProvider = ({ children }: { children: ReactNode }) => {
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  return (
    <CurrentUserContext.Provider value={{ currentUserId, setCurrentUserId }}>
      {children}
    </CurrentUserContext.Provider>
  );
};

export const useCurrentUser = (): CurrentUserContextType => {
  const context = useContext(CurrentUserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
};
