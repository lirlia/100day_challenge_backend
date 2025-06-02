'use client';

import { useState, useEffect } from 'react';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold text-neon-pink mb-8 animate-pulse">
        派手派手オセロバトル
      </h1>
      <p className="text-neon-blue text-xl">
        Loading Game...
      </p>
      {/* ここに将来的にゲームコンポーネントが配置されます */}
    </div>
  );
}
