import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const totalRequestsStmt = db.prepare('SELECT COUNT(*) as count FROM request_logs');
    const totalRequestsResult = totalRequestsStmt.get() as { count: number } | undefined;
    const totalRequests = totalRequestsResult ? totalRequestsResult.count : 0;

    const cacheHitsStmt = db.prepare('SELECT COUNT(*) as count FROM request_logs WHERE cache_hit = 1');
    const cacheHitsResult = cacheHitsStmt.get() as { count: number } | undefined;
    const cacheHits = cacheHitsResult ? cacheHitsResult.count : 0;

    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    // More stats can be added here, e.g., requests per region, content popularity, etc.
    const requestsByRegionStmt = db.prepare(
      'SELECT client_region, COUNT(*) as count FROM request_logs GROUP BY client_region ORDER BY count DESC'
    );
    const requestsByRegion = requestsByRegionStmt.all();

    const contentPopularityStmt = db.prepare(
      'SELECT content_id_requested, COUNT(*) as count FROM request_logs GROUP BY content_id_requested ORDER BY count DESC LIMIT 10'
    );
    const contentPopularity = contentPopularityStmt.all();

    return NextResponse.json({
      totalRequests,
      cacheHits,
      cacheHitRate: parseFloat(cacheHitRate.toFixed(2)), // Format to 2 decimal places
      requestsByRegion,
      contentPopularity,
    });

  } catch (error: any) {
    console.error("Error fetching statistics:", error);
    return NextResponse.json({ error: 'Failed to fetch statistics', details: error.message }, { status: 500 });
  }
}
