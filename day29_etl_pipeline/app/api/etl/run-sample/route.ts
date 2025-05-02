import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { runEtlPipeline, TransformConfig } from '../../../_lib/etl'; // Import the ETL function

const prisma = new PrismaClient();

// --- Define Transformation Config Schema (reuse from run endpoint) ---
// TODO: Consider sharing this schema definition
const stepSchema = z.union([
  z.object({ type: z.literal('selectColumns'), columns: z.array(z.string()) }),
  z.object({ type: z.literal('toUpperCase'), column: z.string() }),
  z.object({ type: z.literal('toLowerCase'), column: z.string() }),
  z.object({ type: z.literal('addConstant'), column: z.string(), value: z.number() }),
  z.object({ type: z.literal('multiplyConstant'), column: z.string(), value: z.number() }),
  z.object({ type: z.literal('filter'), column: z.string(), operator: z.enum(['>', '<', '==', '!=']), value: z.union([z.string(), z.number()]) }),
]);
const transformConfigSchema = z.array(stepSchema);
// --- End of Schema Definition ---

const SAMPLE_CSV_PATH = path.join(process.cwd(), 'public', 'sample.csv');
const SAMPLE_FILENAME = 'sample.csv';

export async function POST(request: Request) {
  try {
    const configString = await request.text(); // Assuming config is sent as plain text JSON body

    let config: TransformConfig = []; // Default empty config array
    if (configString) {
        try {
            const parsedConfig = JSON.parse(configString);
            config = transformConfigSchema.parse(parsedConfig); // Validate config structure
        } catch (e) {
            console.error("Sample Config parsing/validation error:", e);
            const errorMessage = e instanceof z.ZodError ? e.errors : 'Invalid config format';
            return NextResponse.json({ error: 'Invalid config format', details: errorMessage }, { status: 400 });
        }
    } else {
        // If no config provided, use a default simple config for the sample run
        console.log("No config provided for sample run, using default (no-op)");
        config = []; // Explicitly empty = no transformation
    }

    // Check if sample file exists
    try {
      await fs.access(SAMPLE_CSV_PATH);
    } catch (error) {
      console.error('Sample CSV file not found:', SAMPLE_CSV_PATH);
      return NextResponse.json({ error: 'Sample CSV file not found on server' }, { status: 500 });
    }

    // Create PipelineRun entry
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        filename: SAMPLE_FILENAME,
        status: 'pending', // Initial status
        config: config as any, // Store validated config
        previewData: [], // Initialize preview data as empty array
      },
    });

    // Trigger background ETL process using the file path
    runEtlPipeline(pipelineRun.id, { type: 'filepath', path: SAMPLE_CSV_PATH }, config);
    console.log(`[${pipelineRun.id}] Triggered sample ETL pipeline`);

    return NextResponse.json({ pipelineRunId: pipelineRun.id });

  } catch (error) {
    console.error('Error starting sample ETL pipeline:', error);
    return NextResponse.json({ error: 'Failed to start sample ETL pipeline' }, { status: 500 });
  }
}
