import Link from 'next/link';
import db from '@/lib/db';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

// Define the expected shape of a song object
interface Song {
    id: number;
    title: string;
    artist: string | null;
    bpm: number | null;
}

async function getSongs(): Promise<Song[]> {
    // Make sure to select only the necessary columns
    const stmt = db.prepare('SELECT id, title, artist, bpm FROM songs ORDER BY title ASC');
    // Explicitly cast the result to the expected type
    const songs = stmt.all() as Song[];
    return songs;
}

export default async function HomePage() {
    const songs = await getSongs();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-700">Select a Song</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {songs.map((song) => (
                    <Link href={`/play/${song.id}`} key={song.id}>
                        {/* Apply Neumorphic style to the card */}
                        <div className="bg-gray-200 p-4 rounded-lg shadow-neumorphic hover:shadow-neumorphic-inset transition-all duration-200 ease-in-out cursor-pointer">
                            <h2 className="text-xl font-semibold text-gray-800">{song.title}</h2>
                            <p className="text-sm text-gray-600">{song.artist || 'Unknown Artist'}</p>
                            {song.bpm && <p className="text-xs text-gray-500 mt-1">BPM: {song.bpm}</p>}
                        </div>
                    </Link>
                ))}
                {songs.length === 0 && (
                    <p className="text-gray-500">No songs found. Add some data to the database.</p>
                )}
            </div>
        </div>
    );
}

// Revalidate data every 60 seconds (optional)
export const revalidate = 60;
