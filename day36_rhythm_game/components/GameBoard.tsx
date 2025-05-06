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

// Define Judgment types and windows (in seconds)
type Judgment = 'PERFECT' | 'GREAT' | 'GOOD' | 'BAD' | 'MISS' | null;
const PERFECT_WINDOW = 0.05; // ±50ms
const GREAT_WINDOW = 0.10;  // ±100ms
const GOOD_WINDOW = 0.15;   // ±150ms (Previously hitThreshold)
const BAD_WINDOW = 0.20;    // ±200ms - Let's use this for BAD
const MISS_THRESHOLD = BAD_WINDOW; // Anything outside this is a definite miss if a key is pressed

// Simple note element
const NoteElement = React.memo(({ note, topPosition, numLanes }: { note: Note; topPosition: number, numLanes: number }) => {
    const laneIndex = note.lane - 1;
    const leftOffset = laneIndex * (100 / numLanes);
    const width = 100 / numLanes;

    return (
        <div
            className="absolute bg-gradient-to-b from-cyan-400 to-blue-500 border border-blue-600 rounded-md text-black text-xs flex items-center justify-center shadow-lg"
            style={{
                left: `${leftOffset}%`,
                width: `${width}%`,
                top: `${topPosition}px`,
                height: `${noteHeight}px`,
                transform: 'translateY(-50%)'
            }}
        ></div>
    );
});
NoteElement.displayName = 'NoteElement';

interface VisibleNote {
    id: number; // Use note index as ID for simplicity
    note: Note;
    topPosition: number;
}

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
    const [visibleNotes, setVisibleNotes] = useState<VisibleNote[]>([]); // State for notes to render
    const [hitNotes, setHitNotes] = useState<Set<number>>(new Set()); // Store indices of hit notes
    const [isAudioLoaded, setIsAudioLoaded] = useState(false); // State to track audio loading
    const [judgment, setJudgment] = useState<Judgment>(null); // State for judgment text
    const judgmentTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for clearing judgment timeout

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef<number>(0); // AudioContext start time
    const gameLoopRef = useRef<number | null>(null);
    const boardRef = useRef<HTMLDivElement>(null); // Ref to the game board div for height calculation

    // Log when initialNotes prop actually changes
    useEffect(() => {
        console.log('GameBoard received new initialNotes:', initialNotes);
        // Reset relevant state when notes change (e.g., if difficulty switch needs full reset)
        setHitNotes(new Set());
        setVisibleNotes([]);
        // Consider resetting score or currentTime depending on desired behavior
        // setScore(0);
        // setCurrentTime(0);
    }, [initialNotes]); // Dependency array ensures this runs when initialNotes changes

    // --- Audio Setup ---
    useEffect(() => {
        setIsAudioLoaded(false); // Reset on songUrl change
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
                setIsAudioLoaded(true); // <--- Set state to true on success
            })
            .catch(error => {
                console.error("Error loading or decoding audio file:", error);
                audioBufferRef.current = null; // Ensure it's null on error
                setIsAudioLoaded(false); // <--- Set state to false on error
            });

        return () => { // Cleanup on unmount
            audioContextRef.current?.close();
            if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
            sourceNodeRef.current?.stop();
        };
    }, [songUrl]);


    // --- Game Loop ---
    const gameLoop = useCallback(() => {
        console.log('Game Loop Tick - isPlaying:', isPlaying, 'currentTime:', audioContextRef.current?.currentTime); // Added for debugging loop execution

        // ADDED LOG: Check values for the initial conditional check
        console.log('gameLoop Check:', {
            isPlaying: isPlaying,
            hasAudioContext: !!audioContextRef.current,
            startTimeValue: startTimeRef.current, // Log the actual value of startTimeRef
            hasBoardRef: !!boardRef.current, // Check if boardRef.current exists
            boardRefValue: boardRef.current // Log the actual boardRef.current value (might be null)
        });

        if (!isPlaying || !audioContextRef.current || !startTimeRef.current || !boardRef.current) {
            if (isPlaying) gameLoopRef.current = requestAnimationFrame(gameLoop); // Keep requesting if supposed to be playing
            return;
        }

        const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
        setCurrentTime(elapsed);

        const boardHeight = boardRef.current.offsetHeight;
        const judgeLinePosition = boardHeight * (1 - judgeLineBottom / 100);

        // Calculate which notes should be visible
        const currentVisibleNotes: VisibleNote[] = [];

        // ADDED LOG: Check initialNotes just before the loop
        console.log('Inside gameLoop - initialNotes length:', initialNotes?.length, 'Is Array:', Array.isArray(initialNotes));

        initialNotes.forEach((note, index) => {
            if (hitNotes.has(index)) return; // Don't render hit notes

            const noteTime = note.time;
            const timeDifference = noteTime - elapsed; // How far in the future/past the note is
            const topPosition = judgeLinePosition - timeDifference * pixelsPerSecond;

            // Determine visibility window (e.g., slightly above the top to slightly below the bottom)
            const visibilityThresholdTop = -noteHeight * 2; // Start rendering when slightly above screen
            const visibilityThresholdBottom = boardHeight + noteHeight; // Stop rendering when below screen

            // Added detailed console log for note calculation debugging
            console.log('Note Calculation:', {
                index: index,
                noteTime: note.time,
                elapsed: elapsed,
                timeDifference: timeDifference,
                boardHeight: boardHeight,
                judgeLinePosition: judgeLinePosition,
                pixelsPerSecond: pixelsPerSecond,
                calculatedTop: topPosition,
                isVisible: topPosition > visibilityThresholdTop && topPosition < visibilityThresholdBottom
            });

            if (topPosition > visibilityThresholdTop && topPosition < visibilityThresholdBottom) {
                currentVisibleNotes.push({
                    id: index,
                    note: note,
                    topPosition: topPosition
                });
            }
        });
        setVisibleNotes(currentVisibleNotes); // Update the state for React to re-render notes

        // Check for game end condition
        if (audioBufferRef.current && elapsed >= audioBufferRef.current.duration) {
            console.log("Song finished");
            setIsPlaying(false);
            onGameEnd(score);
            setVisibleNotes([]); // Clear notes on finish
            return;
        }

        gameLoopRef.current = requestAnimationFrame(gameLoop);
    }, [isPlaying, score, initialNotes, onGameEnd, hitNotes]);

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

    // --- Input Handling (Revised Logic) ---
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!isPlaying || !boardRef.current) return;
        const keyIndex = keyMap.indexOf(event.key.toLowerCase());
        if (keyIndex === -1) return;

        const targetLane = keyIndex + 1;
        const boardHeight = boardRef.current.offsetHeight;
        const judgeLinePosition = boardHeight * (1 - judgeLineBottom / 100);

        // 1. Collect all potential hits within the threshold
        const potentialHits: { index: number; timeDiff: number; note: Note }[] = [];
        initialNotes.forEach((note, index) => {
            if (hitNotes.has(index) || note.lane !== targetLane) return;
            const timeDifference = Math.abs(note.time - currentTime);
            // Check if within the widest threshold
            if (timeDifference <= MISS_THRESHOLD) {
                potentialHits.push({ index, timeDiff: timeDifference, note });
            }
        });

        // 2. Find the best hit (closest in time) from the potential hits
        let bestHit: { index: number; timeDiff: number; note: Note } | null = null;
        if (potentialHits.length > 0) {
            // Sort by timeDiff ascending and take the first one
            potentialHits.sort((a, b) => a.timeDiff - b.timeDiff);
            bestHit = potentialHits[0]; // The note with the smallest time difference
        }

        // 3. Determine judgment and score based on the best hit
        let currentJudgment: Judgment = 'MISS';
        let scoreToAdd = 0;

        if (bestHit !== null) {
            // Now access properties of bestHit (type should be correctly inferred)
            if (bestHit.timeDiff <= PERFECT_WINDOW) {
                currentJudgment = 'PERFECT';
                scoreToAdd = 300;
            } else if (bestHit.timeDiff <= GREAT_WINDOW) {
                currentJudgment = 'GREAT';
                scoreToAdd = 200;
            } else if (bestHit.timeDiff <= GOOD_WINDOW) {
                currentJudgment = 'GOOD';
                scoreToAdd = 100;
            } else if (bestHit.timeDiff <= BAD_WINDOW) {
                 currentJudgment = 'BAD';
                 scoreToAdd = 10;
            }

             if (currentJudgment !== 'MISS') {
                setHitNotes(prev => new Set(prev).add(bestHit.index)); // No '!' needed potentially
                setScore(prevScore => prevScore + scoreToAdd);
                console.log(`${currentJudgment}! Time diff: ${bestHit.timeDiff.toFixed(3)}s, Lane: ${targetLane}, Key: ${event.key}`);
             } else {
                 console.log(`Miss (near miss). Key: ${event.key}, Lane: ${targetLane}, Time: ${currentTime.toFixed(3)}, Closest note diff: ${bestHit.timeDiff.toFixed(3)}`);
                 currentJudgment = 'MISS';
             }
        } else {
            console.log(`Miss (no note). Key: ${event.key}, Lane: ${targetLane}, Time: ${currentTime.toFixed(3)}`);
            currentJudgment = 'MISS';
        }

        // 4. Display judgment (remains the same)
        setJudgment(currentJudgment);
        if (judgmentTimeoutRef.current) {
            clearTimeout(judgmentTimeoutRef.current);
        }
        judgmentTimeoutRef.current = setTimeout(() => {
            setJudgment(null);
            judgmentTimeoutRef.current = null;
        }, 500);

    }, [isPlaying, keyMap, currentTime, score, initialNotes, hitNotes]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]); // Re-attach listener if handleKeyDown changes


     // --- Start Game ---
     const startGame = async () => { // Make the function async
         if (!isAudioLoaded || !audioContextRef.current || !audioBufferRef.current || isPlaying) return;

         const context = audioContextRef.current;
         const buffer = audioBufferRef.current;

         // Log AudioContext state before attempting resume
         console.log('startGame - AudioContext state BEFORE resume attempt:', context.state);

         // Attempt to resume context if suspended (needs user interaction)
         if (context.state === 'suspended') {
             try {
                 console.log('startGame - Attempting to resume AudioContext...');
                 await context.resume(); // Use await to wait for resume
                 console.log('startGame - AudioContext resumed successfully. New state:', context.state);
             } catch (err) {
                 console.error('startGame - Failed to resume AudioContext:', err);
                 // If resume fails, currentTime might still be 0. Proceed anyway.
             }
         }

         // Reset state including judgment
         setCurrentTime(0);
         setScore(0);
         setHitNotes(new Set());
         setVisibleNotes([]);
         setJudgment(null); // Clear judgment on start
         if (judgmentTimeoutRef.current) clearTimeout(judgmentTimeoutRef.current); // Clear pending timeout

         // Stop previous source if it exists
         sourceNodeRef.current?.stop();

         // Create and configure the audio source node
         sourceNodeRef.current = context.createBufferSource();
         sourceNodeRef.current.buffer = buffer;
         sourceNodeRef.current.connect(context.destination);

         // Record the start time *after* potential resume and *before* starting playback
         console.log('startGame - context.currentTime BEFORE assignment:', context.currentTime);
         startTimeRef.current = context.currentTime;

         // ADDED LOG: Verify the value of startTimeRef.current immediately after setting it
         console.log('startGame - startTimeRef.current set to:', startTimeRef.current);

         // Check if startTimeRef.current is still 0, which would be unexpected
         if (startTimeRef.current === 0) {
             console.warn('startGame - WARNING: startTimeRef.current is 0 immediately after setting! AudioContext state might be:', context.state);
         }

         // Start playback now
         sourceNodeRef.current.start(0);

         // Set isPlaying *after* starting audio and recording time
         setIsPlaying(true);
         console.log("startGame - Game playback initiated. isPlaying:", true);
     };

    // --- Note Rendering Calculation ---
    const boardHeight = boardRef.current?.offsetHeight ?? 400; // Use a default height if ref not ready
    const judgeLinePosition = boardHeight * (1 - judgeLineBottom / 100);

    // Function to get judgment text style
    const getJudgmentStyle = (judg: Judgment): string => {
        switch (judg) {
            case 'PERFECT': return 'text-yellow-300 text-4xl font-extrabold';
            case 'GREAT': return 'text-green-400 text-3xl font-bold';
            case 'GOOD': return 'text-blue-400 text-2xl font-semibold';
            case 'BAD': return 'text-red-500 text-xl font-medium';
            case 'MISS': return 'text-gray-500 text-lg font-normal'; // Style for MISS if you want to display it
            default: return '';
        }
    };

    return (
        <div className="space-y-2">
            {!isPlaying && (
                 <button
                    onClick={startGame}
                    // Use isAudioLoaded state for disabled attribute
                    disabled={!isAudioLoaded}
                    className="px-4 py-2 rounded-lg shadow-neumorphic hover:shadow-neumorphic-inset bg-green-500 text-white focus:outline-none transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {/* Use isAudioLoaded state for button text */}
                    {isAudioLoaded ? 'Start Game' : 'Loading Audio...'}
                </button>
            )}
            {isPlaying && <p className="text-sm text-gray-600">Time: {currentTime.toFixed(2)}s | Score: {score}</p>}

            {/* Game Board Area - Updated height and background */}
            <div
                ref={boardRef}
                className="relative bg-gradient-to-b from-gray-700 to-gray-900 h-[600px] w-full max-w-md mx-auto rounded-lg overflow-hidden shadow-neumorphic-inset" // Increased height and added gradient
            >
                 {/* Judgment Text Display */}
                 {judgment && judgment !== 'MISS' && ( // Only display non-MISS judgments for now
                     <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none ${getJudgmentStyle(judgment)} animate-ping-short`}>
                         {judgment}
                     </div>
                 )}

                 {/* Render notes based on the visibleNotes state */}
                 {visibleNotes.map(({ id, note, topPosition }) => (
                     <NoteElement key={id} note={note} topPosition={topPosition} numLanes={numLanes} />
                 ))}

                {/* Judgment Line - Updated styles */}
                <div
                    className="absolute left-0 right-0 h-1.5 bg-pink-500 shadow-xl shadow-pink-500/50" // Brighter color, thicker, more shadow
                    style={{ bottom: `${judgeLineBottom}%` }}
                ></div>

                {/* Key indicators - Updated styles */}
                <div className="absolute bottom-0 left-0 right-0 h-10 bg-gray-700 flex justify-around items-center px-2 border-t border-gray-600">
                    {keyMap.map((key, index) => (
                        <div
                            key={index}
                            // Added neumorphic shadow and slightly lighter bg
                            className="text-white font-bold text-lg uppercase w-11 h-8 flex items-center justify-center bg-gray-600 rounded shadow-neumorphic-sm"
                        >
                            {key}
                        </div>
                    ))}
                </div>
            </div>
         </div>
    );
}
