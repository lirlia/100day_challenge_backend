import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Helper function for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Zod schema for path parameter validation
const ParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a positive integer").transform(Number),
});

export async function GET(
  req: NextRequest,
  { params }: { params: unknown } // Route Handler の params は直接型付けせず unknown で受け取る
) {
  // Next.js 15 から params は非同期で解決する必要がある
  const resolvedParams = await params;

  // パラメータのバリデーション
  const parseResult = ParamsSchema.safeParse(resolvedParams);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid resource ID', details: parseResult.error.errors },
      { status: 400 }
    );
  }

  const { id } = parseResult.data;

  try {
    // 確率的に大きな遅延をシミュレート (例: 20% の確率)
    const simulateLoss = Math.random() < 0.2;
    const baseDelay = simulateLoss
      ? Math.random() * 1000 + 1000 // 1000ms から 2000ms の大きな遅延
      : Math.random() * 150 + 50;   // 50ms から 200ms の通常遅延

    // 実際の遅延を適用
    await new Promise(resolve => setTimeout(resolve, baseDelay));

    console.log(`Resource ${id} requested, delay: ${baseDelay.toFixed(0)}ms, Simulated Loss: ${simulateLoss}`);

    // ダミーのレスポンスを返す
    const responseData = {
      resourceId: id,
      content: `Content for resource ${id}`,
      delayApplied: Math.round(baseDelay),
      simulatedPacketLoss: simulateLoss,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error(`Error processing resource ${id}:`, error);
    return NextResponse.json({ error: 'Failed to process resource' }, { status: 500 });
  }
}
