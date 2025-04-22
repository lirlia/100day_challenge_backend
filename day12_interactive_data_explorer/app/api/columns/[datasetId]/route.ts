import { type NextRequest, NextResponse } from 'next/server';
import * as duckdb from 'duckdb';
import path from 'node:path';
import { getDatasetInfo } from '../../../_lib/datasets';

interface ColumnInfo {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'other'; // Use literal types
    distinctValues?: (string | number | null)[];
    isNumeric: boolean;
    isDate: boolean;
}

// Helper function to map DuckDB types to simpler categories
function mapDuckDbTypeToSimple(duckDbType: string): ColumnInfo['type'] {
    const upperType = duckDbType.toUpperCase();
    if (['VARCHAR', 'TEXT', 'STRING', 'CHAR', 'BPCHAR', 'UUID'].includes(upperType)) return 'string';
    if (['BIGINT', 'DOUBLE', 'DECIMAL', 'INTEGER', 'FLOAT', 'SMALLINT', 'TINYINT', 'UBIGINT', 'UINTEGER', 'USMALLINT', 'UTINYINT', 'HUGEINT'].includes(upperType)) return 'number';
    if (['BOOLEAN', 'BOOL'].includes(upperType)) return 'boolean';
    if (['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP_S', 'TIMESTAMP_MS', 'TIMESTAMP_NS', 'DATETIME', 'INTERVAL'].includes(upperType)) return 'date';
    // Add other mappings as needed (LIST, STRUCT, MAP, BLOB, ENUM etc.)
    return 'other';
}

// --- DuckDB Native Singleton Initialization (Copied/Adapted) ---
let db: duckdb.Database | null = null;
let con: duckdb.Connection | null = null;
let dbInitializing: Promise<void> | null = null;

async function initializeDbNative(): Promise<void> {
    if (db) return;
    try {
        db = new duckdb.Database(':memory:');
        con = db.connect();
    } catch (err: unknown) {
        console.error('Failed to initialize DuckDB Native:', err);
        db = null;
        con = null;
        throw new Error(`DuckDB Native initialization failed: ${err instanceof Error ? err.message : String(err)}`);
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
type DuckDbRow = Record<string, unknown>;

async function executeQuery(query: string, params: unknown[] = []): Promise<DuckDbRow[]> {
    const currentCon = await getDbConnection();
    return new Promise((resolve, reject) => {
        currentCon.all(query, ...params, (err: Error | null, res: DuckDbRow[]) => {
            if (err) {
                console.error(`Error executing query: ${query}`, params, err);
                reject(err);
            } else {
                resolve(res || []);
            }
        });
    });
}
// --- End Query Execution Helper ---

const columnInfoCache = new Map<string, { data: ColumnInfo[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // Cache for 5 minutes

async function getColumnInfoInternal(datasetId: string): Promise<ColumnInfo[]> {
    const cached = columnInfoCache.get(datasetId);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        return cached.data;
    }

    const datasetInfo = await getDatasetInfo(datasetId);
    if (!datasetInfo) {
        throw new Error(`Dataset with id ${datasetId} not found`);
    }

    const filePath = path.resolve(process.cwd(), datasetInfo.path);

    try {
        const csvOptions = "header=true, delim=',', quote='\"', escape='\"', ignore_errors=true";
        const safeFilePath = filePath.replace(/'/g, "''");
        const describeQuery = `DESCRIBE SELECT * FROM read_csv_auto('${safeFilePath}', ${csvOptions});`;
        const describeResult = await executeQuery(describeQuery);

        const columns: ColumnInfo[] = await Promise.all(describeResult.map(async (row): Promise<ColumnInfo> => {
            const columnName = String(row.column_name);
            const columnType = String(row.column_type).toUpperCase();
            const simpleType = mapDuckDbTypeToSimple(columnType);
            const isNumeric = simpleType === 'number';
            const isDate = simpleType === 'date';

            let distinctValues: (string | number | null)[] | undefined = undefined;

            if (simpleType === 'string' && columnName) {
                 try {
                    const quotedColumnName = `"${columnName.replace(/"/g, '""')}"`;
                    const distinctQuery = `SELECT DISTINCT ${quotedColumnName} FROM read_csv_auto('${safeFilePath}', ${csvOptions}) WHERE ${quotedColumnName} IS NOT NULL LIMIT 100;`;
                     const distinctResult = await executeQuery(distinctQuery);
                     distinctValues = distinctResult.map(dr => dr[columnName]).filter(v => v !== null && v !== undefined) as (string | number | null)[];
                 } catch(distinctError) {
                     console.warn(`Could not fetch distinct values for column "${columnName}":`, distinctError);
                     distinctValues = undefined;
                 }
            }

            return {
                name: columnName,
                type: simpleType,
                distinctValues: distinctValues,
                isNumeric,
                isDate,
            };
        }));

        columnInfoCache.set(datasetId, { data: columns, timestamp: Date.now() });
        return columns;

    } catch (dbError: unknown) {
        console.error(`Database error fetching column info for ${datasetId}:`, dbError);
        throw new Error(`Failed to get column info due to database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }
}


export async function GET(request: NextRequest, context: { params: { datasetId: string } }) {
    // Await the params object before accessing its properties
    const params = await context.params;
    const { datasetId } = params;

    if (!datasetId) {
        // This case might be less likely now with the dynamic route, but good practice
        return NextResponse.json({ error: 'datasetId parameter is required in the path' }, { status: 400 });
    }

    try {
        const columns = await getColumnInfoInternal(datasetId);
        return NextResponse.json({ columns });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`GET /api/columns/${datasetId} error:`, error);

        if (errorMessage.includes('not found')) {
            return NextResponse.json({ error: errorMessage }, { status: 404 });
        }
        if (errorMessage.includes('initialization failed')) {
            return NextResponse.json({ error: `Database initialization failed: ${errorMessage}` }, { status: 500 });
        }
        return NextResponse.json({ error: `Failed to get column info: ${errorMessage}` }, { status: 500 });
    }
}
