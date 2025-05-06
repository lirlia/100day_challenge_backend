'use client'; // Needs to be a client component for useEffect, useState, user interaction

import { useState, useEffect, useCallback, use } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import GameBoard from '@/components/GameBoard'; // Component to display notes
import type { Note } from '@/lib/types'; // Define types for notes if not already done

interface NotesData {
    totalNotes: number;
    notes: Note[];
}

// Define the expected shape for URL params
interface PlayPageParams {
    songId: string;
}

export default function PlayPage({ params }: { params: Promise<PlayPageParams> }) {
    // Resolve the params Promise using React.use()
    const resolvedParams = use(params);
    const { songId } = resolvedParams; // Get songId from resolved params

    const router = useRouter();
    const searchParams = useSearchParams();
    const [notesData, setNotesData] = useState<NotesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('easy'); // Default difficulty
    const userId = searchParams.get('userId') || 'user1'; // Get userId for score submission later

    const fetchNotes = useCallback(async (level: 'easy' | 'hard') => {
        setLoading(true);
        setError(null);
        setNotesData(null); // Clear previous notes
        try {
            const response = await fetch(`/api/songs/${songId}/notes?difficulty=${level}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to fetch notes (${response.status})`);
            }
            const data: NotesData = await response.json();
            setNotesData(data);
        } catch (err: any) {
            console.error('Error fetching notes:', err);
            setError(err.message || 'Could not load song notes.');
        } finally {
            setLoading(false);
        }
    }, [songId]);

    // Fetch notes when difficulty changes or on initial load
    useEffect(() => {
        fetchNotes(difficulty);
    }, [difficulty, fetchNotes]);

    // TODO: Add game logic (timing, input handling, scoring) later
    const handleGameEnd = async (score: number) => {
        console.log(`Game ended for song ${songId}, difficulty ${difficulty} with score: ${score}`);
        try {
             const response = await fetch('/api/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, songId: parseInt(songId, 10), score })
            });
            if (!response.ok) {
                throw new Error('Failed to submit score');
            }
            console.log('Score submitted successfully');
            // Optionally redirect to results page or show score
            // router.push(`/results/${songId}?userId=${userId}&score=${score}`);
        } catch (err) {
            console.error("Error submitting score:", err);
            setError("Failed to submit score.");
        }
    };

    // Neumorphic button styles (can be reused from Header or centralized)
    const neumorphicButtonBase = "px-4 py-2 rounded-lg shadow-neumorphic hover:shadow-neumorphic-inset focus:outline-none transition-all duration-200 ease-in-out";
    const neumorphicActive = "shadow-neumorphic-inset text-blue-600";

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-gray-700">Playing Song ID: {songId}</h1>

            {/* Difficulty Selector */}
            <div className="flex space-x-2">
                 <button
                    onClick={() => setDifficulty('easy')}
                    disabled={loading}
                    className={`${neumorphicButtonBase} ${difficulty === 'easy' ? neumorphicActive : 'bg-gray-200 text-gray-700'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Easy (3 Keys)
                </button>
                <button
                    onClick={() => setDifficulty('hard')}
                    disabled={loading}
                     className={`${neumorphicButtonBase} ${difficulty === 'hard' ? neumorphicActive : 'bg-gray-200 text-gray-700'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
               >
                    Hard (6 Keys)
                </button>
            </div>

            {loading && <p className="text-gray-500">Loading notes...</p>}
            {error && <p className="text-red-500">Error: {error}</p>}

            {notesData && (
                <>
                    {/* Game Board will display notes based on difficulty */}
                    <GameBoard
                        notes={notesData.notes}
                        difficulty={difficulty}
                        onGameEnd={handleGameEnd}
                        songUrl="/audio/test_song.mp3" // Pass the song URL explicitly
                    />
                    {/* Display total notes count */}
                    <p className="text-sm text-gray-600">Total Notes: {notesData.totalNotes}</p>
                 </>
            )}
             {/* Button to simulate game end and score submission (for testing) */}
             <button
                 onClick={() => handleGameEnd(Math.floor(Math.random() * 50000) + 50000)} // Random score for testing
                 className={`${neumorphicButtonBase} bg-green-400 hover:bg-green-500 text-white mt-4`}
                 disabled={!notesData || loading}
             >
                 Simulate Game End & Submit Score
             </button>
        </div>
    );
}
