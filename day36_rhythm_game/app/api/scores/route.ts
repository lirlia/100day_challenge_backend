import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface ScoreRequestBody {
    userId: string;
    songId: number;
    score: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: ScoreRequestBody = await request.json();
        const { userId, songId, score } = body;

        if (!userId || !songId || score === undefined || score === null || score < 0) {
            return NextResponse.json({ error: 'Missing or invalid fields: userId, songId, and non-negative score are required.' }, { status: 400 });
        }

        // Check if song exists
        const songStmt = db.prepare('SELECT id FROM songs WHERE id = ?');
        const song = songStmt.get(songId);
        if (!song) {
            return NextResponse.json({ error: 'Song not found' }, { status: 404 });
        }

        const stmt = db.prepare('INSERT INTO scores (userId, songId, score) VALUES (?, ?, ?)');
        const info = stmt.run(userId, songId, score);

        return NextResponse.json({ message: 'Score recorded successfully', scoreId: info.lastInsertRowid }, { status: 201 });

    } catch (error) {
        console.error('Failed to record score:', error);
         if (error instanceof SyntaxError) { // Handle JSON parsing errors
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to record score' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const songId = searchParams.get('songId');

    if (!songId) {
        return NextResponse.json({ error: 'Missing required query parameter: songId' }, { status: 400 });
    }

    try {
        // Check if song exists
        const songCheckStmt = db.prepare('SELECT id FROM songs WHERE id = ?');
        const songExists = songCheckStmt.get(songId);
        if (!songExists) {
             return NextResponse.json({ error: 'Song not found' }, { status: 404 });
        }

        const stmt = db.prepare(`
            SELECT userId, score, createdAt
            FROM scores
            WHERE songId = ?
            ORDER BY score DESC
            LIMIT 10
        `);
        const scores = stmt.all(songId);

        return NextResponse.json(scores);

    } catch (error) {
        console.error(`Failed to fetch scores for song ${songId}:`, error);
        return NextResponse.json({ error: 'Failed to fetch scores' }, { status: 500 });
    }
}
