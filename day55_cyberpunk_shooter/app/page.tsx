"use client";

import { Suspense } from "react";
import GameScene from "@/components/game/GameScene";

export default function HomePage() {
  return (
    <main className="flex-grow flex flex-col items-center justify-center p-4 md:p-8 lg:p-12 bg-black">
      <div className="w-full h-full max-w-4xl max-h-[80vh] aspect-video border-2 border-cyan-500 shadow-[0_0_15px_5px_rgba(0,255,255,0.5)]">
        <Suspense fallback={<Loading />}>
          <GameScene />
        </Suspense>
      </div>
      <div className="mt-4 text-center">
        <h1 className="text-3xl font-bold text-cyan-400 tracking-wider">
          Day55 - Cyberpunk Shooter
        </h1>
        <p className="text-neutral-400">Loading game...</p>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <div className="w-full h-full flex items-center justify-center text-cyan-400">
      <p className="text-2xl">Loading 3D Assets...</p>
    </div>
  );
}
