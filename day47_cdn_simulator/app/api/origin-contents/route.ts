import { NextResponse } from 'next/server';
import { db, createOriginContent, getAllOriginContents } from '@/lib/db'; // Adjusted path
import type { OriginContent } from '@/app/_lib/types'; // Adjusted path

// GET all origin contents
export async function GET() {
  try {
    const contents = getAllOriginContents() as OriginContent[];
    return NextResponse.json(contents);
  } catch (error: any) {
    console.error("Error fetching origin contents:", error);
    return NextResponse.json({ error: 'Failed to fetch origin contents', details: error.message }, { status: 500 });
  }
}

// POST a new origin content
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content_id, data, content_type } = body;

    if (!content_id || !data || !content_type) {
      return NextResponse.json({ error: 'Missing required fields: content_id, data, content_type' }, { status: 400 });
    }

    const newContent = createOriginContent(content_id, data, content_type) as OriginContent;
    return NextResponse.json(newContent, { status: 201 });
  } catch (error: any) {
    console.error("Error creating origin content:", error);
    if (error.message.includes('already exists')) {
        return NextResponse.json({ error: 'Failed to create origin content', details: error.message }, { status: 409 }); // Conflict
    }
    return NextResponse.json({ error: 'Failed to create origin content', details: error.message }, { status: 500 });
  }
}

// DELETE an origin content by its user-defined content_id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('content_id');

    if (!contentId) {
      return NextResponse.json({ error: 'Missing content_id query parameter' }, { status: 400 });
    }

    const stmt = db.prepare('DELETE FROM origin_contents WHERE content_id = ?');
    const result = stmt.run(contentId);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Content not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ message: `Content '${contentId}' deleted successfully` });
  } catch (error: any) {
    console.error("Error deleting origin content:", error);
    return NextResponse.json({ error: 'Failed to delete origin content', details: error.message }, { status: 500 });
  }
}
