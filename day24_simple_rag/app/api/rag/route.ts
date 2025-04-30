import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../app/generated/prisma'; // Adjust path if needed
import {
  initializeVectorCache,
  findMostSimilarDocument,
} from '../../../lib/vectorStore';

const prisma = new PrismaClient();

// Ensure cache is initialized when the server starts or on the first request
// Using a simple top-level await for initialization (might delay first request)
// Alternatively, trigger initialization elsewhere or use a more robust mechanism
console.log('API route loaded, attempting to initialize vector cache...');
const cacheInitializationPromise = initializeVectorCache().catch((err) => {
  console.error('Failed to initialize vector cache on load:', err);
  // Decide how to handle this failure - maybe retry later or enter a degraded state
});

export async function POST(request: Request) {
  try {
    // Ensure cache initialization is complete before processing requests
    await cacheInitializationPromise;

    const body = await request.json();
    const query = body.query;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required and must be a string' }, { status: 400 });
    }

    console.log(`Received query: ${query}`);

    const mostSimilarDocId = await findMostSimilarDocument(query);

    if (mostSimilarDocId === null) {
      console.log('No similar document found.');
      return NextResponse.json({
        response: `申し訳ありませんが、「${query}」に関連する明確な情報は知識ベースの中に見つかりませんでした。`,
        sources: [],
      });
    }

    console.log(`Found most similar document ID: ${mostSimilarDocId}`);

    const document = await prisma.document.findUnique({
      where: { id: mostSimilarDocId },
    });

    if (!document) {
      // This should ideally not happen if findMostSimilarDocument returned an ID from the cache
      console.error(`Document with ID ${mostSimilarDocId} not found in DB after vector search.`);
      return NextResponse.json({ error: 'Internal server error: Document not found after search' }, { status: 500 });
    }

    // Generate response using a template
    const responseText = `「${document.title}」の情報によると、あなたの質問「${query}」に関連すると思われる記述は以下の通りです。

"${document.content.substring(0, 200)}..."`; // Show first 200 chars

    console.log('Sending response.');
    return NextResponse.json({
      response: responseText,
      sources: [
        {
          id: document.id,
          title: document.title,
          url: document.sourceUrl,
        },
      ],
    });

  } catch (error) {
    console.error('Error processing RAG request:', error);
    // Avoid leaking internal details in production
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
