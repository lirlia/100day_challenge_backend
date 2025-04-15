import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// ユーザーの注文履歴を取得
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

    const orders = await prisma.order.findMany({
      where: {
        userId: userIdNum,
      },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// 新しい注文を作成（カートからの注文処理）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const userIdNum = parseInt(userId);

    if (isNaN(userIdNum)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // ユーザーのカート内商品を取得
    const cartItems = await prisma.cart.findMany({
      where: {
        userId: userIdNum,
      },
      include: {
        product: true,
      },
    });

    if (cartItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // 在庫チェック
    for (const item of cartItems) {
      if (item.product.stock < item.quantity) {
        return NextResponse.json(
          {
            error: `Not enough stock for ${item.product.name}. Available: ${item.product.stock}`,
          },
          { status: 400 }
        );
      }
    }

    // 注文の合計金額を計算
    const totalPrice = cartItems.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );

    // トランザクションで注文処理を行う
    const order = await prisma.$transaction(async (tx) => {
      // 注文を作成
      const order = await tx.order.create({
        data: {
          userId: userIdNum,
          totalPrice,
          status: 'completed',
        },
      });

      // 注文明細を作成
      for (const item of cartItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.product.price,
          },
        });

        // 商品の在庫を減らす
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      // カートを空にする
      await tx.cart.deleteMany({
        where: { userId: userIdNum },
      });

      return order;
    });

    // 作成した注文の詳細を取得して返す
    const orderWithItems = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        orderItems: {
          include: {
            product: true,
          },
        },
      },
    });

    return NextResponse.json(orderWithItems, { status: 201 });
  } catch (error) {
    console.error('Failed to create order:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
