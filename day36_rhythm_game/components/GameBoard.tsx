'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Note } from '@/lib/types';

interface GameBoardProps {
    notes: Note[];
    difficulty: 'easy' | 'hard';
    onGameEnd: (score: number) => void;
    songUrl?: string; // Optional: URL to the song file
}

const easyKeys = ['a', 's', 'd'];
const hardKeys = ['a', 's', 'd', 'j', 'k', 'l'];
const laneWidthPercentage = 100 / 6; // Assuming max 6 lanes for positioning
const judgeLineBottom = 10; // Percentage from bottom for judgment line
const noteHeight = 20; // Pixel height of a note
const hitThreshold = 0.15; // Seconds within which a hit is registered
const pixelsPerSecond = 200; // How many pixels a note travels per second (adjust for scroll speed)

// Simple note element
const NoteElement = React.memo(({ note, topPosition, numLanes }: { note: Note; topPosition: number, numLanes: number }) => {
    const laneIndex = note.lane - 1; // 0-based index
    const leftOffset = laneIndex * (100 / numLanes);
    const width = 100 / numLanes;

    return (
        <div
            className="absolute bg-blue-400 border border-blue-600 rounded text-white text-xs flex items-center justify-center"
            style={{
                left: `${leftOffset}%`,
                width: `${width}%`,
                top: `${topPosition}px`, // Position based on time
                height: `${noteHeight}px`,
                transform: 'translateY(-50%)' // Center note vertically
            }}
        >
            {/* Optional: Display note time or type */}
        </div>
    );
});
NoteElement.displayName = 'NoteElement';


export default function GameBoard({
    notes: initialNotes,
    difficulty,
    onGameEnd,
    songUrl = '/audio/test_song.mp3' // Default song URL
}: GameBoardProps) {
    const numLanes = difficulty === 'easy' ? 3 : 6;
    const keyMap = difficulty === 'easy' ? easyKeys : hardKeys;

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [score, setScore] = useState(0);
    const [activeNotes, setActiveNotes] = useState<Note[]>([]); // Notes currently on screen / active
    const [hitNotes, setHitNotes] = useState<Set<number>>(new Set()); // Store indices of hit notes

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef<number>(0); // AudioContext start time
    const gameLoopRef = useRef<number | null>(null);
    const boardRef = useRef<HTMLDivElement>(null); // Ref to the game board div for height calculation

    // --- Audio Setup ---
    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        fetch(songUrl)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.arrayBuffer();
             })
            .then(arrayBuffer => {
                // Ensure context exists before decoding
                if (!audioContextRef.current) throw new Error("AudioContext not available");
                return audioContextRef.current.decodeAudioData(arrayBuffer); // Returns Promise<AudioBuffer>
            })
            .then(decodedAudio => {
                // decodedAudio should be AudioBuffer here if decode succeeded
                audioBufferRef.current = decodedAudio; // Assign directly
                console.log("Audio loaded successfully");
                // Force re-render to enable start button if needed, by updating a dummy state
                // setAudioLoaded(true); // Example if using state
            })
            .catch(error => {
                console.error("Error loading or decoding audio file:", error);
                audioBufferRef.current = null; // Ensure it's null on error
            });

        return () => { // Cleanup on unmount
            audioContextRef.current?.close();
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            sourceNodeRef.current?.stop();
        };
    }, [songUrl]);


    // --- Game Loop ---
    const gameLoop = useCallback(() => {
        if (!isPlaying || !audioContextRef.current || !startTimeRef.current || !boardRef.current) {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
            return;
        }

        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(elapsed);

        // Update active notes (simplified: just use initialNotes for now)
        // A more optimized approach would filter notes based on current time window
        setActiveNotes(initialNotes);

        // Check for game end condition (e.g., audio finished)
        if (audioBufferRef.current && elapsed >= audioBufferRef.current.duration) {
             console.log("Song finished");
             setIsPlaying(false);
             onGameEnd(score); // Submit final score
             return; // Stop the loop
        }


        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [isPlaying, score, initialNotes, onGameEnd]);

    useEffect(() => {
        if (isPlaying) {
            gameLoopRef.current = requestAnimationFrame(gameLoop);
        } else if (gameLoopRef.current) {
            cancelAnimationFrame(gameLoopRef.current);
        }
        return () => {
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        };
    }, [isPlaying, gameLoop]);

    // --- Input Handling ---
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isPlaying || !boardRef.current) return;

        const keyIndex = keyMap.indexOf(event.key.toLowerCase());
        if (keyIndex === -1) return; // Key not used for this difficulty

        const targetLane = keyIndex + 1; // 1-based lane index
        const boardHeight = boardRef.current.offsetHeight;
        const judgeLinePosition = boardHeight * (1 - judgeLineBottom / 100);

        let noteHit = false;
        initialNotes.forEach((note, index) => {
            // Skip already hit notes or notes for other lanes
            if (hitNotes.has(index) || note.lane !== targetLane) return;

            const noteTime = note.time;
             // Calculate expected position at noteTime and currentTime
             const expectedTopAtNoteTime = judgeLinePosition; // Should be at judge line at its time
             const currentTop = expectedTopAtNoteTime - (noteTime - currentTime) * pixelsPerSecond;

             // Check if the note is near the judgment line based on *time*
             const timeDifference = Math.abs(noteTime - currentTime);

            if (timeDifference <= hitThreshold) {
                // Basic hit!
                console.log(`Hit note! Time diff: ${timeDifference.toFixed(3)}s, Lane: ${targetLane}, Key: ${event.key}`);
                setScore(prevScore => prevScore + 100); // Simple scoring
                setHitNotes(prev => new Set(prev).add(index)); // Mark note as hit
                noteHit = true;
                 // TODO: Add visual feedback (e.g., note disappears or changes color)
            }
        });

        if (noteHit) {
             // Add hit effect?
        } else {
            // Miss? Deduct score?
            console.log(`Miss? Key: ${event.key}, Lane: ${targetLane}, Time: ${currentTime.toFixed(3)}`);
        }

    }, [isPlaying, keyMap, currentTime, score, initialNotes, hitNotes]); // Include dependencies

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]); // Re-attach listener if handleKeyDown changes


     // --- Start Game ---
     const startGame = () => {
         if (!audioContextRef.current || !audioBufferRef.current || isPlaying) return;

         // Reset state
         setCurrentTime(0);
         setScore(0);
         setHitNotes(new Set());
         setActiveNotes(initialNotes); // Reset active notes if necessary

         // Create and start audio source
         sourceNodeRef.current = audioContextRef.current.createBufferSource();
         sourceNodeRef.current.buffer = audioBufferRef.current;

         // --- Volume Control ---
         const gainNode = audioContextRef.current.createGain();
         gainNode.gain.value = 0.2; // Set volume to 20% (adjust as needed)
         // Connect source -> gain -> destination
         sourceNodeRef.current.connect(gainNode);
         gainNode.connect(audioContextRef.current.destination);
         // --- End Volume Control ---


         // Store the precise start time from the AudioContext
         startTimeRef.current = audioContextRef.current.currentTime;
         sourceNodeRef.current.start(startTimeRef.current); // Start playing now

         setIsPlaying(true); // This will trigger the game loop via useEffect

         console.log("Game started");
     };


    // --- Note Rendering Calculation ---
    const boardHeight = boardRef.current?.offsetHeight ?? 400; // Use a default height if ref not ready
    const judgeLinePosition = boardHeight * (1 - judgeLineBottom / 100);


    return (
        <div className="space-y-2">
            {!isPlaying && (
                 <button
                    onClick={startGame}
                    disabled={!audioBufferRef.current} // Disable until audio loads
                    className="px-4 py-2 rounded-lg shadow-neumorphic hover:shadow-neumorphic-inset bg-green-500 text-white focus:outline-none transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {audioBufferRef.current ? 'Start Game' : 'Loading Audio...'}
                </button>
            )}
            {isPlaying && <p className="text-sm text-gray-600">Time: {currentTime.toFixed(2)}s | Score: {score}</p>}

            {/* Game Board Area */}
            <div ref={boardRef} className="relative bg-gray-800 h-96 w-full max-w-md mx-auto rounded-lg overflow-hidden shadow-neumorphic-inset">
                 {/* Render visible notes */}
                 {activeNotes.map((note, index) => {
                     // Only render notes that haven't been hit
                     if (hitNotes.has(index)) return null;

                     // Calculate position based on current time
                     const noteTime = note.time;
                     // Note reaches judge line at note.time
                     // Position = judgeLinePos - distance_to_judge_line
                     // distance = time_difference * speed
                     const timeDifference = noteTime - currentTime;
                     const topPosition = judgeLinePosition - timeDifference * pixelsPerSecond;

                     // Only render notes that are potentially visible on the board
                     // (Adjust visibility window as needed)
                     if (topPosition > -noteHeight && topPosition < boardHeight + noteHeight) {
                        return <NoteElement key={index} note={note} topPosition={topPosition} numLanes={numLanes} />;
                     }
                     return null;
                 })}

                {/* Judgment Line */}
                <div
                    className="absolute left-0 right-0 h-1 bg-red-500 shadow-lg"
                    style={{ bottom: `${judgeLineBottom}%` }}
                ></div>

                {/* Key indicators */}
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gray-700 flex justify-around items-center px-2">
                    {keyMap.map((key, index) => (
                        <div key={index} className="text-white font-bold text-lg uppercase w-10 h-8 flex items-center justify-center bg-gray-600 rounded shadow-neumorphic-sm">
                            {key}
                        </div>
                    ))}
                </div>
            </div>
         </div>
    );
}
