export interface OriginContent {
  id: number;
  content_id: string; // User-defined ID
  data: string; // Content data or URL to content (e.g., Picsum)
  content_type: string; // e.g., text/html, application/json, image/jpeg
  created_at?: string; // ISO 8601 date string
}

export interface EdgeServer {
  id: number;
  server_id: string; // User-defined ID for the edge server
  region: string; // e.g., "Japan", "US-West", "EU-Central"
  cache_capacity: number; // Max number of items in cache
  default_ttl: number; // Default Time-To-Live for cached items in seconds (0 means no cache by default)
  created_at?: string; // ISO 8601 date string
}

export interface EdgeCacheItem {
  id: number;
  edge_server_id_ref: number; // Foreign key to EdgeServer.id
  content_id_ref: number; // Foreign key to OriginContent.id
  original_content_id: string; // User-defined content_id from OriginContent for display
  cached_at: string; // ISO 8601 date string when item was cached
  last_accessed_at: string; // ISO 8601 date string, for LRU logic
  expires_at: string; // ISO 8601 date string, when the cache item expires (based on TTL)
  // Optional: include data if you want to display cached content directly, but can be heavy
  // data?: string;
}

export interface RequestLog {
  id: number;
  requested_at?: string; // ISO 8601 date string
  client_region: string;
  content_id_requested: string; // User-defined content_id that was requested
  served_by_edge_server_id?: number | null; // FK to EdgeServer.id, or null if from origin
  cache_hit: boolean;
  delivered_from_origin: boolean; // True if the request had to go to the origin server for any reason (e.g., cache miss, first load)
}

// For API responses or UI state, you might want slightly different or combined types
export interface EdgeServerWithCache extends EdgeServer {
  cache_items: EdgeCacheItem[];
  current_load?: number; // Number of items currently in cache (calculated)
}

export interface SimulationResult {
  message: string;
  clientRegion: string;
  requestedContentId: string;
  servedBy: string; // "Origin Server" or EdgeServer.server_id
  cacheStatus: "HIT" | "MISS_AND_CACHED" | "MISS_CAPACITY_FULL" | "MISS_NO_CACHE_RULE" | "ORIGIN_FETCH_ERROR";
  cachedItem?: EdgeCacheItem | null;
  evictedItem?: EdgeCacheItem | null; // If an item was evicted due to LRU
  log?: RequestLog;
  updatedEdgeServer?: EdgeServerWithCache; // To update UI after simulation
}

export const REGIONS = [
  { id: "AS-JP", name: "Asia (Japan)" },
  { id: "AS-SG", name: "Asia (Singapore)" },
  { id: "US-W", name: "US (West)" },
  { id: "US-E", name: "US (East)" },
  { id: "EU-C", name: "Europe (Central)" },
  { id: "SA-BR", name: "South America (Brazil)" },
  { id: "AU-SY", name: "Australia (Sydney)" },
];

export type RegionId = typeof REGIONS[number]["id"];
