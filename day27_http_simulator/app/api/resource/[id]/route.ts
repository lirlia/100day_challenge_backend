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
    // 50ms から 200ms のランダムな遅延をシミュレート
    const delay = 50 + Math.random() * 150;
    await sleep(delay);

    // ダミーのレスポンスを返す
    const responseData = {
      resourceId: id,
      content: `Content for resource ${id}`,
      delayApplied: Math.round(delay),
    };

    console.log(`Responding for resource ${id} after ${Math.round(delay)}ms delay.`);
    return NextResponse.json(responseData);

  } catch (error) {
    console.error(`Error processing resource ${id}:`, error);
    return NextResponse.json({ error: 'Failed to process resource' }, { status: 500 });
  }
}
