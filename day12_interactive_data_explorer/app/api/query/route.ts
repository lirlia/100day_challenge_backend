import { NextRequest, NextResponse } from 'next/server';
import * as duckdb from 'duckdb'; // Use native duckdb
import path from 'path';
import { getDatasetInfo } from '../../_lib/datasets'; // Use shared dataset logic

// Reuse or redefine DB initialization and query execution logic
// --- DuckDB Native Singleton Initialization (Copied/Adapted) ---
let db: duckdb.Database | null = null;
let con: duckdb.Connection | null = null;
let dbInitializing: Promise<void> | null = null;

async function initializeDbNative(): Promise<void> {
    if (db) return;
    console.log('Initializing DuckDB Native for Query API...');
    try {
        db = new duckdb.Database(':memory:');
        con = db.connect();
        console.log('DuckDB Native Initialized Successfully for Query API.');
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

// --- Query Execution Helper (Copied/Adapted) ---
type DuckDbRow = Record<string, any>;

async function executeQuery(query: string, params: any[] = []): Promise<DuckDbRow[]> {
    const currentCon = await getDbConnection();
    return new Promise((resolve, reject) => {
        // IMPORTANT: Parameters are NOT correctly handled with callback API here.
        // The query string MUST contain manually escaped/quoted values for now.
        currentCon.all(query, /* ...params, */ (err: Error | null, res: DuckDbRow[]) => {
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


// --- API Request/Response Types ---
interface Filter {
    column: string;
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN';
    value: any; // Can be string, number, or array for IN
}

interface Aggregation {
    column: string; // Can be '*' for COUNT
    function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
    alias: string;
}

interface QueryRequest {
    datasetId: string;
    filters?: Filter[];
    groups?: string[];
    aggregations?: Aggregation[];
}

// --- SQL Builder Logic ---

// VERY BASIC SANITIZATION (NOT SQL INJECTION PROOF - USE WITH CAUTION)
function sanitizeValueForSql(val: any): string {
    if (typeof val === 'number' && isFinite(val)) return String(val);
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`; // Escape single quotes
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (val === null || val === undefined) return 'NULL';
    // Arrays are handled separately for IN clause
    console.warn("Unsupported value type for sanitization:", typeof val);
    return 'NULL'; // Default to NULL for safety
}

function escapeSqlIdentifier(identifier: string): string {
    // Replace double quotes with two double quotes for SQL escaping
    return `"${identifier.replace(/"/g, '""')}"`;
}

function buildSelectClause(aggregations?: Aggregation[], groups?: string[]): string {
    if (aggregations && aggregations.length > 0) {
        const groupCols = groups ? groups.map(escapeSqlIdentifier).join(', ') : ''; // Use helper
        const aggCols = aggregations.map(agg => {
            const func = agg.function.toUpperCase();
            // Handle COUNT(*) separately, don't quote '*'
            const colIdentifier = agg.column === '*' ? '*' : escapeSqlIdentifier(agg.column);
            const alias = escapeSqlIdentifier(agg.alias); // Use helper
            // Ensure COUNT(*) doesn't become COUNT(""*"")
            return `${func}(${colIdentifier}) AS ${alias}`;
        }).join(', ');
        return groupCols ? `${groupCols}, ${aggCols}` : aggCols;
    }
    return '*'; // Default to selecting all if no aggregations
}

function buildWhereClause(filters?: Filter[]): string {
    if (!filters || filters.length === 0) {
        return '';
    }
    const conditions: string[] = [];

    filters.forEach(filter => {
        const column = escapeSqlIdentifier(filter.column); // Use helper
        let condition = '';
        let value = filter.value;

        switch (filter.operator) {
            case '=':
            case '!=':
            case '>':
            case '<':
            case '>=':
            case '<=':
                condition = `${column} ${filter.operator} ${sanitizeValueForSql(value)}`;
                 break;
            case 'IN':
                 if (Array.isArray(value) && value.length > 0) {
                    const sanitizedValues = value.map(sanitizeValueForSql).join(', ');
                     condition = `${column} IN (${sanitizedValues})`;
                 } else {
                    console.warn(`Skipping IN filter for ${filter.column} due to invalid value:`, value);
                     return; // Skip invalid IN
                 }
                 break;
            default:
                console.warn(`Skipping filter due to unsupported operator: ${filter.operator}`);
                return; // Skip unsupported
        }
         conditions.push(condition);
    });

    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

function buildGroupByClause(groups?: string[]): string {
    if (!groups || groups.length === 0) {
        return '';
    }
    return `GROUP BY ${groups.map(escapeSqlIdentifier).join(', ')}`; // Use helper
}


// --- Main POST Handler ---
export async function POST(request: NextRequest) {
    let requestBody: QueryRequest;
    try {
        requestBody = await request.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { datasetId, filters, groups, aggregations } = requestBody;

    if (!datasetId) {
        return NextResponse.json({ error: 'datasetId is required' }, { status: 400 });
    }

    // Basic validation (can be expanded)
    if (filters && !Array.isArray(filters)) return NextResponse.json({ error: 'filters must be an array' }, { status: 400 });
    if (groups && !Array.isArray(groups)) return NextResponse.json({ error: 'groups must be an array' }, { status: 400 });
    if (aggregations && !Array.isArray(aggregations)) return NextResponse.json({ error: 'aggregations must be an array' }, { status: 400 });

    try {
        const datasetInfo = await getDatasetInfo(datasetId);
        if (!datasetInfo) {
            return NextResponse.json({ error: `Dataset with id ${datasetId} not found` }, { status: 404 });
        }

        const filePath = path.resolve(process.cwd(), datasetInfo.path);
        // Use consistent CSV options from columns API, sanitize path for SQL string
        const csvOptions = "header=true, delim=',', quote='\"', escape='\"', ignore_errors=true";
        const safeFilePath = filePath.replace(/'/g, "''");
        const fromClause = `read_csv_auto('${safeFilePath}', ${csvOptions})`;

        // Build query parts using manual escaping
        const selectClause = buildSelectClause(aggregations, groups);
        const whereClause = buildWhereClause(filters);
        const groupByClause = buildGroupByClause(groups);

        // Construct final SQL
        const generatedSql = `SELECT ${selectClause} FROM ${fromClause} ${whereClause} ${groupByClause};`;

        console.log("Executing Query:", generatedSql);
        // Execute query - no parameters needed due to manual escaping
        const results = await executeQuery(generatedSql);

        // --- Format results ---
        const columns = results.length > 0 ? Object.keys(results[0]) : [];
        const rows = results.map(row => {
            return Object.values(row).map(value => {
                // Convert BigInt to string for JSON serialization
                if (typeof value === 'bigint') {
                    return value.toString();
                }
                return value;
            });
        });

        const tableData = {
            columns: columns,
            rows: rows,
        };

        // Basic chart data generation
        let chartData = null;
        if (aggregations && aggregations.length > 0 && groups && groups.length > 0 && results.length > 0) {
            const groupColumn = groups[0];
            const firstAggAlias = aggregations[0].alias;

            // Find actual keys (case-insensitive)
            const groupKey = Object.keys(results[0]).find(k => k.toLowerCase() === groupColumn.toLowerCase()) || groupColumn;
            const aggKey = Object.keys(results[0]).find(k => k.toLowerCase() === firstAggAlias.toLowerCase()) || firstAggAlias;

            chartData = {
                type: 'bar',
                labels: results.map(row => {
                    const val = row[groupKey];
                    return typeof val === 'bigint' ? val.toString() : val; // Handle BigInt for labels
                }),
                datasets: [{
                    label: firstAggAlias,
                    data: results.map(row => {
                         const val = row[aggKey];
                         // Convert BigInt in dataset data to number
                         return typeof val === 'bigint' ? Number(val) : val;
                    }),
                }],
            };

             // Add second aggregation dataset if present (also handle BigInt)
             if (aggregations.length > 1) {
                const secondAggAlias = aggregations[1].alias;
                const aggKey2 = Object.keys(results[0]).find(k => k.toLowerCase() === secondAggAlias.toLowerCase()) || secondAggAlias;
                if (aggKey2 && chartData && chartData.datasets) {
                    chartData.datasets.push({
                        label: secondAggAlias,
                        data: results.map(row => {
                            const val = row[aggKey2];
                            return typeof val === 'bigint' ? Number(val) : val; // Handle BigInt
                        }),
                    });
                }
             }
        }

        return NextResponse.json({
            generatedSql,
            tableData,
            chartData,
        });

    } catch (error: any) {
        console.error(`POST /api/query error for dataset ${datasetId}:`, error);
        return NextResponse.json({ error: `Query execution failed: ${error.message}` }, { status: 500 });
    }
}
