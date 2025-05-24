import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_DIR = path.join(process.cwd(), 'db');
const DB_PATH = path.join(DB_DIR, 'dev.db');

// Ensure the db directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const db = new Database(DB_PATH, { verbose: console.log });
db.pragma('journal_mode = WAL'); // Enable WAL mode for better concurrency
db.pragma('foreign_keys = ON'); // Enforce foreign key constraints

// Schema definition
const schema = `
CREATE TABLE IF NOT EXISTS origin_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id TEXT UNIQUE NOT NULL,
  data TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL,
  cache_capacity INTEGER NOT NULL,
  default_ttl INTEGER NOT NULL, -- seconds, 0 for no cache
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS edge_cache_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edge_server_id_ref INTEGER NOT NULL,
  content_id_ref INTEGER NOT NULL, -- This refers to origin_contents.id
  -- For simplicity, we can also store original content_id text here if needed for display
  -- but content_id_ref is for integrity.
  original_content_id TEXT NOT NULL, -- User-defined content_id for easier display/lookup in cache
  cached_at TEXT NOT NULL, -- ISO8601
  last_accessed_at TEXT NOT NULL, -- ISO8601, for LRU
  expires_at TEXT NOT NULL, -- ISO8601, for TTL
  FOREIGN KEY (edge_server_id_ref) REFERENCES edge_servers(id) ON DELETE CASCADE,
  FOREIGN KEY (content_id_ref) REFERENCES origin_contents(id) ON DELETE CASCADE,
  UNIQUE (edge_server_id_ref, content_id_ref) -- An item should be cached only once per edge server
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  client_region TEXT NOT NULL,
  content_id_requested TEXT NOT NULL, -- User-defined content_id
  served_by_edge_server_id INTEGER, -- Can be NULL if served directly from origin (e.g. edge down or no cache rule)
  cache_hit BOOLEAN NOT NULL,
  delivered_from_origin BOOLEAN NOT NULL, -- True if request went to origin (even if for caching)
  FOREIGN KEY (served_by_edge_server_id) REFERENCES edge_servers(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_edge_cache_items_server_content ON edge_cache_items(edge_server_id_ref, original_content_id);
CREATE INDEX IF NOT EXISTS idx_edge_cache_items_expires ON edge_cache_items(expires_at);
CREATE INDEX IF NOT EXISTS idx_edge_cache_items_access ON edge_cache_items(edge_server_id_ref, last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_content_server ON request_logs(content_id_requested, served_by_edge_server_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_region ON request_logs(client_region);
`;

// Function to initialize schema
export function initializeSchema() {
  try {
    db.exec(schema);
    console.log('Database schema initialized successfully.');

    // Check if tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('origin_contents', 'edge_servers', 'edge_cache_items', 'request_logs')").all();
    if (tables.length === 4) {
      console.log('All tables created successfully.');
    } else {
      console.error('Some tables were not created. Existing tables:', tables.map(t => (t as any).name));
    }
  } catch (error) {
    console.error('Error initializing database schema:', error);
    // If schema init fails, it might be due to existing incompatible schema.
    // Suggest deleting the db file in such cases.
    if (fs.existsSync(DB_PATH)) {
        console.warn(
            `Consider deleting the database file at ${DB_PATH} and restarting if schema issues persist.`
        );
    }
  }
}

// Call initialization when this module is loaded
// This ensures that the schema is applied when the server starts
initializeSchema();

// Utility function for safe column name (though not strictly needed for this app's complexity)
// const safeColumn = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, '');

// Example CRUD (will be expanded in API routes)
// Get all origin contents
export const getAllOriginContents = () => {
  const stmt = db.prepare('SELECT id, content_id, data, content_type, created_at FROM origin_contents');
  return stmt.all();
};

// Create an origin content
export const createOriginContent = (contentId: string, data: string, contentType: string) => {
  const stmt = db.prepare('INSERT INTO origin_contents (content_id, data, content_type) VALUES (?, ?, ?)');
  try {
    const result = stmt.run(contentId, data, contentType);
    return { id: result.lastInsertRowid, content_id: contentId, data, contentType };
  } catch (error: any) {
    console.error("Failed to create origin content:", error.message);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error(`Content ID '${contentId}' already exists.`);
    }
    throw error;
  }
};

// --- Add more DB interaction functions as needed for other tables ---

console.log(`SQLite database initialized at ${DB_PATH}`);
