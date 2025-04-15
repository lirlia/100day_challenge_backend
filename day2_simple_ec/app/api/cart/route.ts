import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
        product: true,
      },
    });

    return NextResponse.json(cartItems);
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

    // 商品が存在するか確認
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // 在庫チェック
    if (product.stock < quantity) {
      return NextResponse.json(
        { error: 'Not enough stock available' },
        { status: 400 }
      );
    }

    // 既存のカートアイテムを検索
    const existingCartItem = await prisma.cart.findFirst({
      where: {
        userId,
        productId,
      },
    });

    let cartItem;

    if (existingCartItem) {
      // 既存のカートアイテムを更新
      cartItem = await prisma.cart.update({
        where: { id: existingCartItem.id },
        data: { quantity },
        include: { product: true },
      });
    } else {
      // 新しいカートアイテムを作成
      cartItem = await prisma.cart.create({
        data: {
          userId,
          productId,
          quantity,
        },
        include: { product: true },
      });
    }

    return NextResponse.json(cartItem);
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
