'use client';

import React from 'react';
import type { Note } from '@/lib/types';

interface GameBoardProps {
    notes: Note[];
    difficulty: 'easy' | 'hard';
    onGameEnd: (score: number) => void; // Callback when game ends
}

// Keys setup based on difficulty
const easyKeys = ['a', 's', 'd'];
const hardKeys = ['a', 's', 'd', 'j', 'k', 'l'];

export default function GameBoard({ notes, difficulty, onGameEnd }: GameBoardProps) {
    const numLanes = difficulty === 'easy' ? 3 : 6;
    const keyMap = difficulty === 'easy' ? easyKeys : hardKeys;

    // TODO: Implement actual game logic:
    // - Note rendering and animation (falling from top)
    // - Input handling (detecting key presses for a,s,d,j,k,l)
    // - Timing and scoring based on key presses relative to note timing
    // - Visual feedback (hit animations, combo counter)
    // - Call onGameEnd(calculatedScore) when the song finishes

    return (
        <div className="relative bg-gray-800 h-96 w-full max-w-md mx-auto rounded-lg overflow-hidden shadow-neumorphic-inset">
             {/* Static Representation for now */}
             <p className="text-white text-center p-4">Game Board Area</p>
             <p className="text-white text-center text-sm">({numLanes} Lanes)</p>
             <p className="text-yellow-400 text-center text-xs p-2">Notes will fall here...</p>
             {/* TODO: Render notes based on the notes array and current time */}

             {/* Judgment Line */}
            <div className="absolute bottom-10 left-0 right-0 h-1 bg-red-500 shadow-lg"></div>

             {/* Key indicators at the bottom */}
             <div className="absolute bottom-0 left-0 right-0 h-10 bg-gray-700 flex justify-around items-center px-2">
                 {keyMap.map((key, index) => (
                     <div key={index} className="text-white font-bold text-lg uppercase w-10 h-8 flex items-center justify-center bg-gray-600 rounded shadow-neumorphic-sm">
                         {key}
                     </div>
                 ))}
             </div>
        </div>
    );
}
