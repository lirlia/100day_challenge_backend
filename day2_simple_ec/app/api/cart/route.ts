import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentProductPrice } from '@/lib/priceUtils'; // 価格取得ヘルパーをインポート

// ユーザーのカート内商品を取得
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const cartItems = await prisma.cart.findMany({
      where: {
        userId: userIdNum,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            stock: true,
            description: true, // description も必要そうなので追加
          },
        },
      },
    });

    // 各カートアイテムに最新価格を追加
    const cartItemsWithPrice = await Promise.all(
      cartItems.map(async (item) => {
        const currentPrice = await getCurrentProductPrice(item.productId);
        return {
          ...item,
          currentPrice: currentPrice ?? 0, // 価格がなければ0とする
        };
      })
    );

    return NextResponse.json(cartItemsWithPrice);
  } catch (error) {
    console.error('Failed to fetch cart items:', error);
    return NextResponse.json({ error: 'Failed to fetch cart items' }, { status: 500 });
  }
}

// カートに商品を追加または数量を更新
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, productId, quantity } = body;

    if (!userId || !productId || quantity === undefined) {
      return NextResponse.json(
        { error: 'User ID, product ID, and quantity are required' },
        { status: 400 }
      );
    }

    // 商品が存在するか、在庫を確認 (select で stock も取得)
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stock: true, description: true, imageUrl: true }, // 必要な情報を select
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.stock < quantity) {
      return NextResponse.json(
        { error: 'Not enough stock available' },
        { status: 400 }
      );
    }

    // 最新価格を取得
    const currentPrice = await getCurrentProductPrice(productId);
    if (currentPrice === null) {
      // 価格未設定の場合はエラーとするか、デフォルト価格を使うか？
      // ここではエラーとする
      return NextResponse.json({ error: `Price not set for product ${product.name}` }, { status: 400 });
    }

    const upsertedCartItem = await prisma.cart.upsert({
      where: {
        userId_productId: { // @@unique([userId, productId]) を利用
          userId: userId,
          productId: productId,
        },
      },
      update: { quantity: quantity }, // 数量を更新
      create: { // なければ作成
        userId: userId,
        productId: productId,
        quantity: quantity,
      },
      // include はここでは不要、必要な情報は product と currentPrice で取得済み
    });

    // レスポンスに必要な情報を結合して返す
    const responseCartItem = {
      ...upsertedCartItem,
      product: product, // select で取得した商品情報
      currentPrice: currentPrice, // 取得した最新価格
    };

    return NextResponse.json(responseCartItem);

  } catch (error) {
    console.error('Failed to update cart:', error);
    return NextResponse.json({ error: 'Failed to update cart' }, { status: 500 });
  }
}

// カートから商品を削除
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cartItemId = searchParams.get('id');

    if (!cartItemId) {
      return NextResponse.json({ error: 'Cart item ID is required' }, { status: 400 });
    }

    const cartItemIdNum = parseInt(cartItemId);

    if (isNaN(cartItemIdNum)) {
      return NextResponse.json({ error: 'Invalid cart item ID' }, { status: 400 });
    }

    await prisma.cart.delete({
      where: { id: cartItemIdNum },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete cart item:', error);
    return NextResponse.json({ error: 'Failed to delete cart item' }, { status: 500 });
  }
}
