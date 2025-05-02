import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Params {
    pipelineRunId: string;
}

// Note: Next.js 15+ dynamic params access requires await
export async function GET(request: Request, { params }: { params: Params }) {
  try {
    const awaitedParams = await params;
    const { pipelineRunId } = awaitedParams; // Access param after await (already handled by framework)

    if (!pipelineRunId) {
      return NextResponse.json({ error: 'Missing pipelineRunId' }, { status: 400 });
    }

    const pipelineRun = await prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      // Optionally include some processed data for preview
      // include: {
      //   processedData: {
      //     take: 5, // Limit preview size
      //   },
      // },
    });

    if (!pipelineRun) {
      return NextResponse.json({ error: 'Pipeline run not found' }, { status: 404 });
    }

    // TODO: Potentially augment response with more detailed progress

    return NextResponse.json(pipelineRun);

  } catch (error) {
    console.error('Error fetching ETL status:', error);
    return NextResponse.json({ error: 'Failed to fetch ETL status' }, { status: 500 });
  }
}
