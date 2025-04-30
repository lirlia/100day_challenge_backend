import { PrismaClient } from '../app/generated/prisma'; // Use the generated client path
import {
  pipeline,
  env,
  type PipelineType,
  type Pipeline,
  type TextClassificationPipeline,
  type FeatureExtractionPipeline,
} from '@xenova/transformers';

// Skip local model check for this environment
env.allowLocalModels = false;

// Global cache for vectors and initialization flag
let documentVectors: Map<number, number[]> = new Map();
let isCacheInitialized = false;
let embedder: FeatureExtractionPipeline | null = null;

const prisma = new PrismaClient();

// Helper function for cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Initialize the embedding model
async function initializeEmbedder() {
  if (!embedder) {
    console.log('Initializing embedding model...');
    // Using a multilingual model suitable for Japanese
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/multilingual-e5-small'
    );
    console.log('Embedding model initialized.');
  }
  return embedder;
}

// Initialize the vector cache by fetching data and embedding it
export async function initializeVectorCache() {
  if (isCacheInitialized) {
    return;
  }

  console.log('Initializing vector cache...');
  await initializeEmbedder(); // Ensure model is loaded first
  if (!embedder) {
    throw new Error('Embedder not initialized');
  }

  const documents = await prisma.document.findMany({
    select: { id: true, content: true },
  });

  console.log(`Found ${documents.length} documents to vectorize.`);
  documentVectors = new Map(); // Reset cache

  for (const doc of documents) {
    // Embed content, pooling strategy 'mean' is common
    const output = await embedder(doc.content, { pooling: 'mean', normalize: true });
    // Assuming the vector is in output.data as Float32Array
    if (output.data instanceof Float32Array) {
        // Ensure the vector is stored as a standard number array
        const vector = Array.from(output.data);
        documentVectors.set(doc.id, vector);
        console.log(`Vectorized document ${doc.id}`);
    } else {
        console.error(`Unexpected embedding output format for doc ${doc.id}`);
    }
  }

  isCacheInitialized = true;
  console.log('Vector cache initialized.');

  // Disconnect prisma client after seeding cache if it's not needed elsewhere immediately
  // await prisma.$disconnect();
  // Keep prisma connected if the API route will use it further.
}

// Find the document most similar to the query
export async function findMostSimilarDocument(query: string): Promise<number | null> {
  if (!isCacheInitialized || documentVectors.size === 0) {
    console.error('Vector cache is not initialized or empty.');
    // Optionally, try initializing on the fly, but this might be slow for API requests
    // await initializeVectorCache();
    // if (!isCacheInitialized || documentVectors.size === 0) return null;
    return null; // Or throw an error
  }

  await initializeEmbedder(); // Ensure model is available
   if (!embedder) {
    throw new Error('Embedder not initialized');
  }

  console.log(`Searching for query: "${query}"`);
  const queryEmbeddingOutput = await embedder(query, { pooling: 'mean', normalize: true });
  if (!(queryEmbeddingOutput.data instanceof Float32Array)) {
    console.error('Failed to embed query.');
    return null;
  }
  const queryVector = Array.from(queryEmbeddingOutput.data);

  let bestMatchId: number | null = null;
  let highestSimilarity = -Infinity;

  for (const [docId, docVector] of documentVectors.entries()) {
    const similarity = cosineSimilarity(queryVector, docVector);
    console.log(`Similarity with doc ${docId}: ${similarity}`);
    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      bestMatchId = docId;
    }
  }

  console.log(`Best match: doc ${bestMatchId} with similarity ${highestSimilarity}`);
  return bestMatchId;
}
