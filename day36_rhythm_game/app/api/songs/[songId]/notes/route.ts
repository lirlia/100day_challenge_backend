import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface Params {
  songId: string;
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
    const awaitedParams = await params;
    const { songId } = awaitedParams;
    const { searchParams } = new URL(request.url);
    const difficulty = searchParams.get('difficulty') || 'easy'; // Default to easy

    if (difficulty !== 'easy' && difficulty !== 'hard') {
        return NextResponse.json({ error: 'Invalid difficulty level. Use "easy" or "hard".' }, { status: 400 });
    }

    try {
        // 1. Get the song to find the correct notes ID based on difficulty
        const songStmt = db.prepare('SELECT easyNotesId, hardNotesId FROM songs WHERE id = ?');
        const song = songStmt.get(songId) as { easyNotesId: number | null, hardNotesId: number | null } | undefined;

        if (!song) {
            return NextResponse.json({ error: 'Song not found' }, { status: 404 });
        }

        const notesId = difficulty === 'hard' ? song.hardNotesId : song.easyNotesId;

        if (!notesId) {
             return NextResponse.json({ error: `Notes not found for difficulty: ${difficulty}` }, { status: 404 });
        }

        // 2. Get the notes data using the notes ID
        const notesStmt = db.prepare('SELECT notesData FROM notes WHERE id = ?');
        const notesRecord = notesStmt.get(notesId) as { notesData: string } | undefined;

        if (!notesRecord) {
            return NextResponse.json({ error: 'Notes data not found' }, { status: 404 });
        }

        // Parse the JSON string before sending
        const notesData = JSON.parse(notesRecord.notesData);

        return NextResponse.json(notesData);

    } catch (error) {
        console.error(`Failed to fetch notes for song ${songId} (${difficulty}):`, error);
        // Check if the error is due to JSON parsing
        if (error instanceof SyntaxError) {
             return NextResponse.json({ error: 'Failed to parse notes data' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Failed to fetch notes data' }, { status: 500 });
    }
}
