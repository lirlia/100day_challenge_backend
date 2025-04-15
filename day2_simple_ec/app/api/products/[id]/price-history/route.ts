import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Context = {
  params: {
    id: string;
  };
};

export async function GET(request: NextRequest, context: Context) {
  try {
    const productId = parseInt(context.params.id);

    if (isNaN(productId)) {
      return NextResponse.json({ error: 'Invalid Product ID' }, { status: 400 });
    }

    const priceHistory = await prisma.productPrice.findMany({
      where: {
        productId: productId,
      },
      orderBy: {
        startDate: 'asc', // 時系列順にソート
      },
      select: {
        price: true,
        startDate: true,
      },
    });

    return NextResponse.json(priceHistory);

  } catch (error) {
    console.error('Failed to fetch price history:', error);
    return NextResponse.json({ error: 'Failed to fetch price history' }, { status: 500 });
  }
}
