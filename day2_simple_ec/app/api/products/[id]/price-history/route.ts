import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Context 型は不要になる
// type Context = {
//   params: {
//     id: string;
//   };
// };

// context 引数を削除
export async function GET(request: NextRequest) {
  try {
    // pathname から ID を抽出
    const pathname = request.nextUrl.pathname;
    // 例: /api/products/123/price-history -> ['', 'api', 'products', '123', 'price-history']
    const segments = pathname.split('/');
    // ID は末尾から2番目のセグメントのはず
    const idString = segments[segments.length - 2];

    // ★ pathname から ID を取得して数値に変換
    // const idString = context.params.id; // 修正前
    const productId = parseInt(idString);

    if (isNaN(productId)) {
      console.error('Failed to parse productId from pathname:', pathname);
      return NextResponse.json({ error: 'Invalid Product ID in URL' }, { status: 400 });
    }

    // ★ ここから await を含む処理 (変更なし)
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
