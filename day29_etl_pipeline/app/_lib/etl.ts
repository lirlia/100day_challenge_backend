import { PrismaClient, Prisma } from '@prisma/client';
// import type { PipelineRun } from '@prisma/client'; // Comment out for now
import Papa from 'papaparse';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

// --- Types --- Interfaces for Transformation Config --- TODO: Refine later ---
export type TransformStep =
  | { type: 'selectColumns'; columns: string[] }
  | { type: 'toUpperCase'; column: string }
  | { type: 'toLowerCase'; column: string }
  | { type: 'addConstant'; column: string; value: number }
  | { type: 'multiplyConstant'; column: string; value: number }
  | { type: 'filter'; column: string; operator: '>' | '<' | '==' | '!='; value: string | number };

export type TransformConfig = TransformStep[];

export interface PreviewData {
  step: string; // 'extract', 'transform_0', 'transform_1', ..., 'load'
  rowCount: number;
  columns: string[];
  rows: Record<string, any>[]; // Preview rows (e.g., first 5)
}

// --- Helper Functions ---

async function updatePipelineStatus(
  pipelineRunId: string,
  status: string,
  preview?: PreviewData | null,
  errorMessage?: string | null
) {
  const data: Record<string, any> = { status }; // Use Record<string, any> instead of Partial<PipelineRun>
  if (preview) {
    const existingRun = await prisma.pipelineRun.findUnique({ where: { id: pipelineRunId }, select: { previewData: true } });
    const existingPreview = existingRun?.previewData ? (existingRun.previewData as Prisma.JsonValue[]) : [];
    data.previewData = [...existingPreview, preview as Prisma.JsonValue];
  }
  if (errorMessage !== undefined) {
    data.errorMessage = errorMessage;
  }
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data,
  });
}

// Function to apply a single transformation step
function applyTransformStep(data: Record<string, any>[], step: TransformStep): Record<string, any>[] {
  console.log(`Applying transform: ${step.type}`);
  switch (step.type) {
    case 'selectColumns':
      return data.map(row => {
        const newRow: Record<string, any> = {};
        step.columns.forEach(col => {
          if (row.hasOwnProperty(col)) {
            newRow[col] = row[col];
          }
        });
        return newRow;
      });
    case 'toUpperCase':
      return data.map(row => ({ ...row, [step.column]: String(row[step.column]).toUpperCase() }));
    case 'toLowerCase':
      return data.map(row => ({ ...row, [step.column]: String(row[step.column]).toLowerCase() }));
    case 'addConstant':
      return data.map(row => ({ ...row, [step.column]: Number(row[step.column]) + step.value }));
    case 'multiplyConstant':
      return data.map(row => ({ ...row, [step.column]: Number(row[step.column]) * step.value }));
    case 'filter':
      return data.filter(row => {
        const val = row[step.column];
        const compareVal = typeof val === 'number' ? Number(step.value) : String(step.value);
        switch (step.operator) {
          case '>': return val > compareVal;
          case '<': return val < compareVal;
          case '==': return String(val) == String(compareVal); // Use loose equality for flexibility
          case '!=': return String(val) != String(compareVal);
          default: return true;
        }
      });
    default:
      console.warn('Unknown transform step:', step);
      return data;
  }
}

function createPreview(stepName: string, data: Record<string, any>[]): PreviewData {
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    const previewRows = data.slice(0, 5);
    return {
        step: stepName,
        rowCount: data.length,
        columns,
        rows: previewRows,
    };
}

// --- Main ETL Function --- (Runs asynchronously)

export async function runEtlPipeline(
  pipelineRunId: string,
  input: string | { type: 'filepath'; path: string }, // CSV content as string or path to file
  config: TransformConfig // Array of transformation steps
) {
  let originalFilename = 'uploaded_file.csv'; // Default for string input
  let csvContent: string;

  try {
    // --- 1. Extract --- (Parse CSV)
    await updatePipelineStatus(pipelineRunId, 'extracting');
    console.log(`[${pipelineRunId}] Extracting...`);

    if (typeof input === 'object' && input.type === 'filepath') {
      originalFilename = path.basename(input.path);
      csvContent = await fs.readFile(input.path, 'utf-8');
    } else if (typeof input === 'string') {
      csvContent = input;
    } else {
      console.error("Invalid input type:", input);
      throw new Error('Invalid input type for ETL pipeline');
    }

    const parseResult = Papa.parse<Record<string, any>>(csvContent, {
      header: true, // Use first row as header
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers/booleans
    });

    if (parseResult.errors.length > 0) {
        console.error("CSV Parse Errors:", parseResult.errors);
        throw new Error(`CSV Parsing failed: ${parseResult.errors[0].message}`);
    }

    let data = parseResult.data;
    const extractPreview = createPreview('extract', data);
    await updatePipelineStatus(pipelineRunId, 'transforming', extractPreview);
    console.log(`[${pipelineRunId}] Extracted ${data.length} rows.`);

    // --- 2. Transform --- (Apply steps sequentially)
    for (let i = 0; i < config.length; i++) {
        const step = config[i];
        console.log(`[${pipelineRunId}] Applying transform step ${i}: ${step.type}`);
        data = applyTransformStep(data, step);
        const transformPreview = createPreview(`transform_${i}`, data);
        // Update status without changing overall status, just add preview
        await updatePipelineStatus(pipelineRunId, 'transforming', transformPreview);
        console.log(`[${pipelineRunId}] After step ${i}, ${data.length} rows remaining.`);

    }

    // --- 3. Load --- (Insert into DB)
    await updatePipelineStatus(pipelineRunId, 'loading');
    console.log(`[${pipelineRunId}] Loading ${data.length} rows into database...`);

    // Prepare data for Prisma createMany
    const dataToLoad = data.map(row => ({
        pipelineRunId: pipelineRunId,
        originalFilename: originalFilename,
        data: row as Prisma.InputJsonObject,
    }));

    // Use transaction for potentially large inserts if needed, but createMany is often sufficient
    await prisma.processedData.createMany({
        data: dataToLoad,
    });

    const loadPreview = createPreview('load', data);
    await updatePipelineStatus(pipelineRunId, 'completed', loadPreview);
    console.log(`[${pipelineRunId}] Loading complete.`);

  } catch (error: any) {
    console.error(`[${pipelineRunId}] ETL Pipeline failed:`, error);
    await updatePipelineStatus(pipelineRunId, 'failed', null, error.message || 'Unknown error');
  }
}
