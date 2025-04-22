import { NextRequest, NextResponse } from 'next/server';
import * as duckdb from 'duckdb'; // Use native duckdb
import path from 'path';
import { getDatasetInfo } from '../../_lib/datasets';

// --- DuckDB Native Singleton Initialization ---
let db: duckdb.Database | null = null;
let con: duckdb.Connection | null = null;
let dbInitializing: Promise<void> | null = null;

async function initializeDbNative(): Promise<void> {
    if (db) return;
    console.log('Initializing DuckDB Native...');
    try {
        db = new duckdb.Database(':memory:');
        con = db.connect();
        // Optional: Run any initial setup queries if needed
        // await new Promise<void>((resolve, reject) => {
        //     con.run("INSTALL httpfs; LOAD httpfs;", (err) => err ? reject(err) : resolve());
        // });
        console.log('DuckDB Native Initialized Successfully.');
    } catch (err: any) {
        console.error('Failed to initialize DuckDB Native:', err);
        db = null;
        con = null;
        throw new Error(`DuckDB Native initialization failed: ${err.message}`);
    } finally {
        dbInitializing = null;
    }
}

function getDbConnection(): Promise<duckdb.Connection> {
    if (con) return Promise.resolve(con);
    if (dbInitializing) {
        return dbInitializing.then(() => {
            if (!con) throw new Error("DB Init seemed complete, but connection is null.");
            return con;
        });
    }
    dbInitializing = initializeDbNative();
    return dbInitializing.then(() => {
        if (!con) throw new Error("DB Init failed or connection is null.");
        return con;
    });
}
// --- End DuckDB Native Initialization ---

// --- Query Execution Helper (Callback Wrapper) ---
type DuckDbRow = Record<string, any>;

async function executeQuery(query: string, params: any[] = []): Promise<DuckDbRow[]> {
    const currentCon = await getDbConnection();
    return new Promise((resolve, reject) => {
        currentCon.all(query, ...params, (err: Error | null, res: DuckDbRow[]) => {
            if (err) {
                console.error(`Error executing query: ${query}`, params, err);
                reject(err);
            } else {
                // Ensure res is always an array, even if empty
                resolve(res || []);
            }
        });
    });
}
// --- End Query Execution Helper ---

// Helper to map DuckDB types
function mapDuckDbType(duckDbType: string): 'string' | 'number' | 'date' | 'boolean' | 'other' {
    const upperType = duckDbType.toUpperCase();
    if (upperType.includes('VARCHAR') || upperType.includes('TEXT') || upperType.includes('STRING')) {
        return 'string';
    }
    if (['BIGINT', 'INTEGER', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'UBIGINT', 'UINTEGER', 'USMALLINT', 'UTINYINT'].some(t => upperType.includes(t))) {
        return 'number';
    }
    if (upperType.includes('DATE') || upperType.includes('TIMESTAMP')) {
        return 'date';
    }
    if (upperType.includes('BOOLEAN')) {
        return 'boolean';
    }
    return 'other';
}

interface ColumnInfo {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'other';
    distinctValues?: (string | number | null)[];
}

const columnInfoCache = new Map<string, { timestamp: number; data: ColumnInfo[] }>();
const CACHE_DURATION = 5 * 60 * 1000;

async function getColumnInfoInternal(datasetId: string): Promise<ColumnInfo[]> {
    const cached = columnInfoCache.get(datasetId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        console.log(`Using cached column info for ${datasetId}`);
        return cached.data;
    }

    const datasetInfo = await getDatasetInfo(datasetId);
    if (!datasetInfo) {
        throw new Error(`Dataset with id ${datasetId} not found`);
    }

    const filePath = path.resolve(process.cwd(), datasetInfo.path);
    console.log(`Fetching column info for ${datasetInfo.name} (${filePath})`);

    try {
        const csvOptions = "header=true, delim=',', quote='\"', escape='\"', ignore_errors=true";
        const describeQuery = `DESCRIBE SELECT * FROM read_csv_auto(?, ${csvOptions});`;
        console.log("Executing DESCRIBE query for:", datasetId);
        const describeResult = await executeQuery(describeQuery, [filePath]);

        if (!Array.isArray(describeResult)) {
            throw new Error('Internal error: Describe query failed to return expected data format.');
        }

        const columns: ColumnInfo[] = [];

        for (const row of describeResult) {
            const columnName = row.column_name as string;
            const duckDbType = row.column_type as string;

            if (!columnName || !duckDbType) {
                console.warn("Skipping row with missing column name or type:", row);
                continue;
            }

            const simpleType = mapDuckDbType(duckDbType);
            const info: ColumnInfo = { name: columnName, type: simpleType };

            if (simpleType === 'string') {
                try {
                    const quotedColumnName = `\"${columnName.replace(/"/g, '\\"')}\"`;
                    const distinctQuery = `SELECT DISTINCT ${quotedColumnName} FROM read_csv_auto(?, ${csvOptions}) WHERE ${quotedColumnName} IS NOT NULL LIMIT 100;`;
                    console.log(`Executing DISTINCT query for: ${columnName}`);
                    const distinctResult = await executeQuery(distinctQuery, [filePath]);

                    if (!Array.isArray(distinctResult)) {
                        throw new Error(`Internal error: Distinct query failed for column ${columnName}.`);
                    }

                    info.distinctValues = distinctResult
                        .map(r => r ? r[columnName] : null)
                        .filter(v => v !== null && v !== undefined)
                        .map(String);
                } catch (distinctErr) {
                    console.error(`Error fetching distinct values for ${columnName}:`, distinctErr);
                }
            }
            columns.push(info);
        }

        columnInfoCache.set(datasetId, { timestamp: Date.now(), data: columns });
        return columns;

    } catch (error) {
        console.error(`Error getting column info for dataset ${datasetId} (Native):`, error);
        columnInfoCache.delete(datasetId);
        throw new Error(`Failed to get column info from Native DB for dataset ${datasetId}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const datasetId = searchParams.get('datasetId');

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    try {
        const columns = await getColumnInfoInternal(datasetId);
        return NextResponse.json({ columns });
    } catch (error: any) {
        console.error(`GET /api/columns error for dataset ${datasetId} (Native):`, error);
        if (error.message.includes('not found')) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        } else if (error.message.includes('initialization failed')) {
            return NextResponse.json({ error: `Database initialization failed: ${error.message}` }, { status: 500 });
        } else {
            return NextResponse.json({ error: `Failed to get column info: ${error.message}` }, { status: 500 });
        }
    }
}
