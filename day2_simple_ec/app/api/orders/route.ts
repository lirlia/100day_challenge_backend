import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentProductPrice } from '@/lib/priceUtils'; // ヘルパー関数をインポート

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
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },
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

    // ユーザーのカート内商品を取得 (addedPrice も取得)
    const cartItemsData = await prisma.cart.findMany({
      where: {
        userId: userIdNum,
      },
      include: {
        product: {
          select: { id: true, name: true, stock: true },
        },
      },
      // addedPrice は Cart モデルに直接含まれるので include 不要
    });

    if (cartItemsData.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    // ★ トランザクション前の価格比較チェック (lastSeenPrice と比較)
    let priceMismatchFound = false;
    const cartItemsWithCurrentPrices = await Promise.all(
      cartItemsData.map(async (item) => {
        const currentPrice = await getCurrentProductPrice(item.productId);
        if (currentPrice === null) {
          throw new Error(
            `Price not found for product ${item.product.name} (ID: ${item.productId})`
          );
        }
        // ★ 最後に確認した価格 (lastSeenPrice) と最新価格を比較
        // lastSeenPrice が null の場合は、初回確認なので比較スキップ (常にOK扱い)
        if (item.lastSeenPrice !== null && item.lastSeenPrice !== currentPrice) {
          priceMismatchFound = true;
          console.warn(
            `Price mismatch for product ${item.product.name} (ID: ${item.productId}). Last seen price: ${item.lastSeenPrice}, Current price: ${currentPrice}`
          );
        }
        return {
          ...item,
          currentPrice: currentPrice, // 最新価格は後続処理で使う
        };
      })
    );

    // ★ 価格不一致が見つかった場合はエラーを返す
    if (priceMismatchFound) {
      // 価格が変わった商品と最新価格のリストを作成
      const changedItems = cartItemsWithCurrentPrices
        .filter(item =>
          item.lastSeenPrice !== null &&
          item.lastSeenPrice !== item.currentPrice
        )
        .map(item => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          oldPrice: item.lastSeenPrice,
          newPrice: item.currentPrice,
          quantity: item.quantity
        }));

      // エラーメッセージと共に変更された商品情報を返す
      return NextResponse.json(
        {
          error: '前回確認した時から商品の価格が変更されました。カートを再度ご確認ください。',
          changedItems: changedItems,
          // カート更新のために自動的にlastSeenPriceを更新するフラグ
          shouldUpdateCart: true
        },
        { status: 409 } // 409 Conflict
      );
    }

    // 在庫チェック (cartItemsWithCurrentPrices を使用)
    for (const item of cartItemsWithCurrentPrices) {
      if (item.product.stock < item.quantity) {
        return NextResponse.json(
          {
            error: `Not enough stock for ${item.product.name}. Available: ${item.product.stock}`,
          },
          { status: 400 }
        );
      }
    }

    // 注文の合計金額を計算 (cartItemsWithCurrentPrices を使用)
    const totalPrice = cartItemsWithCurrentPrices.reduce(
      (sum, item) => sum + item.currentPrice * item.quantity,
      0
    );

    // トランザクションで注文処理を行う
    const order = await prisma.$transaction(async (tx) => {
      // 注文を作成
      const order = await tx.order.create({
        data: {
          userId: userIdNum,
          totalPrice, // 計算済みの合計金額
          status: 'completed',
        },
      });

      // 注文明細を作成 (cartItemsWithCurrentPrices を使用)
      for (const item of cartItemsWithCurrentPrices) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.currentPrice, // 最新価格を記録
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

    // 作成した注文の詳細を取得して返す (Product の price は不要になったので select で調整してもよい)
    const orderWithItems = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        orderItems: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true }, // product.price は不要
            },
          },
        },
      },
    });

    return NextResponse.json(orderWithItems, { status: 201 });
  } catch (error) {
    console.error('Failed to create order:', error);
    if (error instanceof Error) {
      // 価格が見つからない場合のエラーをハンドリング
      if (error.message.includes('Price not found')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
