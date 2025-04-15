import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentProductPrice } from '@/lib/priceUtils';

// 商品の最新価格を見たときに、カート内の lastSeenPrice を更新するAPI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, productId } = body;

    if (!userId || !productId) {
      return NextResponse.json(
        { error: 'User ID and product ID are required' },
        { status: 400 }
      );
    }

    // 最新価格を取得
    const currentPrice = await getCurrentProductPrice(productId);
    if (currentPrice === null) {
      return NextResponse.json(
        { error: 'Price not found for the product' },
        { status: 400 }
      );
    }

    // カート内に商品があるか確認
    const cartItem = await prisma.cart.findUnique({
      where: {
        userId_productId: {
          userId: parseInt(userId.toString()),
          productId: parseInt(productId.toString()),
        },
      },
    });

    // カートに商品がなければ何もしない
    if (!cartItem) {
      return NextResponse.json({ success: false, updated: false });
    }

    // lastSeenPrice が既に最新価格と同じであれば更新しない
    if (cartItem.lastSeenPrice === currentPrice) {
      return NextResponse.json({ success: true, updated: false });
    }

    // lastSeenPrice を更新
    await prisma.cart.update({
      where: {
        id: cartItem.id,
      },
      data: {
        lastSeenPrice: currentPrice,
      },
    });

    return NextResponse.json({
      success: true,
      updated: true,
      message: `Updated lastSeenPrice for cart item (product ID: ${productId}) to ${currentPrice}`
    });
  } catch (error) {
    console.error('Failed to update last seen price:', error);
    return NextResponse.json(
      { error: 'Failed to update last seen price' },
      { status: 500 }
    );
  }
}
