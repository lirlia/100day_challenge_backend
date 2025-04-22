import fs from 'node:fs/promises';
import path from 'node:path';

export interface DatasetInfo {
  id: string;
  name: string;
  path: string; // Relative path from project root
}

const dataDir = path.resolve(process.cwd(), 'data');

async function listAllDatasetFiles(): Promise<DatasetInfo[]> {
    try {
      const files = await fs.readdir(dataDir);
      const csvFiles = files.filter(file => file.toLowerCase().endsWith('.csv'));

      return csvFiles.map(file => {
        const id = path.parse(file).name; // Use filename without extension as ID
        const filePath = path.join('data', file); // Relative path
        return { id, name: file, path: filePath };
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          console.warn(`Data directory not found: ${dataDir}`);
          return [];
      }
      console.error('Error listing dataset files:', error);
      // Propagate a generic error or return empty depending on desired handling
      throw new Error('Failed to list dataset files');
    }
}

// Cache for the list of all datasets to avoid repeated directory reads
let allDatasetsCache: DatasetInfo[] | null = null;
let cacheTimestamp = 0;
const ALL_DATASETS_CACHE_DURATION = 60 * 1000; // Cache for 1 minute

/**
 * Retrieves a list of all available datasets.
 * Uses a short cache to avoid reading the directory on every request.
 */
export async function getAllDatasets(): Promise<DatasetInfo[]> {
    const now = Date.now();
    if (allDatasetsCache && (now - cacheTimestamp < ALL_DATASETS_CACHE_DURATION)) {
        return allDatasetsCache;
    }
    allDatasetsCache = await listAllDatasetFiles();
    cacheTimestamp = now;
    return allDatasetsCache;
}

/**
 * Retrieves information for a specific dataset by its ID.
 */
export async function getDatasetInfo(datasetId: string): Promise<DatasetInfo | undefined> {
    const datasets = await getAllDatasets(); // Use the cached list
    return datasets.find(ds => ds.id === datasetId);
}
