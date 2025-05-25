import { db } from '@/lib/db';
import type { OriginContent, EdgeServer, EdgeCacheItem, RequestLog, SimulationResult, RegionId } from './types';
import { REGIONS } from './types';

/**
 * Finds the most suitable edge server based on client region.
 * For simplicity, it tries to match the exact region first.
 * If not found, it could be extended to find the "closest" or a default one.
 */
export function findBestEdgeServer(clientRegion: RegionId, allEdgeServers: EdgeServer[]): EdgeServer | null {
  if (!allEdgeServers || allEdgeServers.length === 0) return null;
  const regionalMatch = allEdgeServers.find(server => server.region === clientRegion);
  if (regionalMatch) return regionalMatch;
  // Fallback: return the first available server if no regional match (or implement more complex routing)
  return allEdgeServers[0] || null;
}

/**
 * Simulates a client request for a piece of content.
 */
export async function simulateRequest(clientRegion: RegionId, contentIdToRequest: string): Promise<SimulationResult> {
  const allOriginContents = db.prepare('SELECT * FROM origin_contents').all() as OriginContent[];
  const allEdgeServers = db.prepare('SELECT * FROM edge_servers').all() as EdgeServer[];

  const originContent = allOriginContents.find(oc => oc.content_id === contentIdToRequest);
  if (!originContent) {
    return {
      message: `Content ID '${contentIdToRequest}' not found on origin server.`,
      clientRegion,
      requestedContentId: contentIdToRequest,
      servedBy: 'Origin Server (Error)',
      cacheStatus: 'ORIGIN_FETCH_ERROR',
    };
  }

  const edgeServer = findBestEdgeServer(clientRegion, allEdgeServers);

  const requestLogPartial: Omit<RequestLog, 'id' | 'requested_at'> = {
    client_region: clientRegion,
    content_id_requested: contentIdToRequest,
    served_by_edge_server_id: edgeServer?.id || null,
    cache_hit: false,
    delivered_from_origin: false, // Will be set to true if origin is accessed
  };

  if (!edgeServer || edgeServer.default_ttl === 0) { // No suitable edge or edge server has caching disabled
    requestLogPartial.delivered_from_origin = true;
    const log = db.prepare('INSERT INTO request_logs (client_region, content_id_requested, served_by_edge_server_id, cache_hit, delivered_from_origin) VALUES (?, ?, ?, ?, ?)')
                  .run(requestLogPartial.client_region, requestLogPartial.content_id_requested, requestLogPartial.served_by_edge_server_id, false, true).lastInsertRowid;
    return {
      message: `Served '${contentIdToRequest}' directly from origin. ${!edgeServer ? 'No suitable edge server.' : 'Edge server caching disabled.'}`,
      clientRegion,
      requestedContentId: contentIdToRequest,
      servedBy: 'Origin Server',
      cacheStatus: 'MISS_NO_CACHE_RULE',
      log: { ...requestLogPartial, id: Number(log), requested_at: new Date().toISOString() },
    };
  }

  // Check cache on the selected edge server
  const now = new Date();
  const nowISO = now.toISOString();

  const cachedItemStmt = db.prepare(
    'SELECT * FROM edge_cache_items WHERE edge_server_id_ref = ? AND original_content_id = ? AND expires_at > ?'
  );
  let cachedItem = cachedItemStmt.get(edgeServer.id, contentIdToRequest, nowISO) as EdgeCacheItem | undefined;

  if (cachedItem) { // Cache HIT
    db.prepare('UPDATE edge_cache_items SET last_accessed_at = ? WHERE id = ?').run(nowISO, cachedItem.id);
    requestLogPartial.cache_hit = true;
    requestLogPartial.delivered_from_origin = false; // Served from cache
    const log = db.prepare('INSERT INTO request_logs (client_region, content_id_requested, served_by_edge_server_id, cache_hit, delivered_from_origin) VALUES (?, ?, ?, ?, ?)')
                  .run(requestLogPartial.client_region, requestLogPartial.content_id_requested, edgeServer.id, true, false).lastInsertRowid;

    const updatedEdgeCacheItems = db.prepare('SELECT * FROM edge_cache_items WHERE edge_server_id_ref = ? ORDER BY last_accessed_at DESC').all(edgeServer.id) as EdgeCacheItem[];

    return {
      message: `Cache HIT for '${contentIdToRequest}' on edge server '${edgeServer.server_id}'.`,
      clientRegion,
      requestedContentId: contentIdToRequest,
      servedBy: edgeServer.server_id,
      cacheStatus: 'HIT',
      cachedItem,
      log: { ...requestLogPartial, id: Number(log), requested_at: nowISO },
      updatedEdgeServer: { ...edgeServer, cache_items: updatedEdgeCacheItems, current_load: updatedEdgeCacheItems.length },
    };
  } else { // Cache MISS
    requestLogPartial.delivered_from_origin = true; // Fetching from origin
    let evictedItem: EdgeCacheItem | null = null;

    const currentCacheItems = db.prepare('SELECT * FROM edge_cache_items WHERE edge_server_id_ref = ?').all(edgeServer.id) as EdgeCacheItem[];

    if (currentCacheItems.length >= edgeServer.cache_capacity) {
      // LRU eviction: find the least recently used item
      const lruItemStmt = db.prepare('SELECT * FROM edge_cache_items WHERE edge_server_id_ref = ? ORDER BY last_accessed_at ASC LIMIT 1');
      evictedItem = lruItemStmt.get(edgeServer.id) as EdgeCacheItem | undefined || null;
      if (evictedItem) {
        db.prepare('DELETE FROM edge_cache_items WHERE id = ?').run(evictedItem.id);
      }
    }

    // Add to cache
    const expiresAt = new Date(now.getTime() + edgeServer.default_ttl * 1000).toISOString();
    const newCacheEntryStmt = db.prepare(
      'INSERT INTO edge_cache_items (edge_server_id_ref, content_id_ref, original_content_id, cached_at, last_accessed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const newCacheResult = newCacheEntryStmt.run(edgeServer.id, originContent.id, originContent.content_id, nowISO, nowISO, expiresAt);
    const newCachedItem = db.prepare('SELECT * FROM edge_cache_items WHERE id = ?').get(newCacheResult.lastInsertRowid) as EdgeCacheItem;

    const log = db.prepare('INSERT INTO request_logs (client_region, content_id_requested, served_by_edge_server_id, cache_hit, delivered_from_origin) VALUES (?, ?, ?, ?, ?)')
                  .run(requestLogPartial.client_region, requestLogPartial.content_id_requested, edgeServer.id, false, true).lastInsertRowid;

    const updatedEdgeCacheItemsAfterMiss = db.prepare('SELECT * FROM edge_cache_items WHERE edge_server_id_ref = ? ORDER BY last_accessed_at DESC').all(edgeServer.id) as EdgeCacheItem[];

    return {
      message: `Cache MISS for '${contentIdToRequest}' on '${edgeServer.server_id}'. Fetched from origin and cached. ${evictedItem ? `Evicted '${evictedItem.original_content_id}'.` : ''}`,
      clientRegion,
      requestedContentId: contentIdToRequest,
      servedBy: edgeServer.server_id,
      cacheStatus: currentCacheItems.length >= edgeServer.cache_capacity ? 'MISS_CAPACITY_FULL' : 'MISS_AND_CACHED',
      cachedItem: newCachedItem,
      evictedItem,
      log: { ...requestLogPartial, id: Number(log), requested_at: nowISO },
      updatedEdgeServer: { ...edgeServer, cache_items: updatedEdgeCacheItemsAfterMiss, current_load: updatedEdgeCacheItemsAfterMiss.length },
    };
  }
}
