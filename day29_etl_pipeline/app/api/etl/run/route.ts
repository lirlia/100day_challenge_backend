import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { runEtlPipeline, TransformConfig } from '../../../_lib/etl'; // Import the ETL function

const prisma = new PrismaClient();

// --- Define Transformation Config Schema (Example) ---
const stepSchema = z.union([
  z.object({ type: z.literal('selectColumns'), columns: z.array(z.string()) }),
  z.object({ type: z.literal('toUpperCase'), column: z.string() }),
  z.object({ type: z.literal('toLowerCase'), column: z.string() }),
  z.object({ type: z.literal('addConstant'), column: z.string(), value: z.number() }),
  z.object({ type: z.literal('multiplyConstant'), column: z.string(), value: z.number() }),
  z.object({ type: z.literal('filter'), column: z.string(), operator: z.enum(['>', '<', '==', '!=']), value: z.union([z.string(), z.number()]) }),
]);

const transformConfigSchema = z.array(stepSchema);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const configString = formData.get('config') as string | null;

    if (!file || !configString) {
      return NextResponse.json({ error: 'Missing file or config' }, { status: 400 });
    }

    let config: TransformConfig;
    try {
      const parsedConfig = JSON.parse(configString);
      config = transformConfigSchema.parse(parsedConfig); // Validate config structure
    } catch (e) {
      console.error("Config parsing/validation error:", e);
      const errorMessage = e instanceof z.ZodError ? e.errors : 'Invalid config format';
      return NextResponse.json({ error: 'Invalid config format', details: errorMessage }, { status: 400 });
    }

    const fileContent = await file.text();

    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        filename: file.name,
        status: 'pending', // Initial status
        config: config as any, // Store validated config (cast needed for Prisma Json type)
        previewData: [], // Initialize preview data as empty array
      },
    });

    // Trigger background ETL process (async, do not block response)
    runEtlPipeline(pipelineRun.id, fileContent, config);
    console.log(`[${pipelineRun.id}] Triggered ETL pipeline for ${file.name}`);

    return NextResponse.json({ pipelineRunId: pipelineRun.id });

  } catch (error) {
    console.error('Error starting ETL pipeline:', error);
    return NextResponse.json({ error: 'Failed to start ETL pipeline' }, { status: 500 });
  }
}
