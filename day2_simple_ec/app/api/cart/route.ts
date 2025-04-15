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

    // 各カートアイテムの最新価格を取得し、DBの lastSeenPrice を更新
    try {
      const processedCartItems = await Promise.all(
        cartItems.map(async (item) => {
          try {
            const currentPrice = await getCurrentProductPrice(item.productId);
            const safeCurrentPrice = currentPrice ?? 0; // null なら 0 とする

            // item.lastSeenPrice が undefined または null の場合に対応
            const safeLastSeenPrice = item.lastSeenPrice ?? null;

            let priceJustChanged = false;
            // 最後に見た価格と最新価格を比較
            if (safeLastSeenPrice !== null && safeLastSeenPrice !== safeCurrentPrice) {
              priceJustChanged = true;
            }

            // lastSeenPrice を更新する条件を安全に判定
            // null の場合や値が異なる場合に更新する
            if (safeLastSeenPrice === null || safeLastSeenPrice !== safeCurrentPrice) {
              try {
                await prisma.cart.update({
                  where: { id: item.id },
                  data: { lastSeenPrice: safeCurrentPrice },
                });
                console.log(`Updated lastSeenPrice for cart item ${item.id} to ${safeCurrentPrice}`);
              } catch (updateError) {
                console.error(`Failed to update lastSeenPrice for cart item ${item.id}:`, updateError);
                // エラーがあっても処理を続行する
              }
            }

            // 返却するオブジェクトを構築
            return {
              ...item,
              lastSeenPrice: safeCurrentPrice, // 更新後の最新価格
              currentPrice: safeCurrentPrice,  // APIレスポンス用の現在価格
              priceJustChanged: priceJustChanged, // 価格変更フラグ
            };
          } catch (itemError) {
            // 個別の商品の処理中にエラーが発生した場合でも、他の商品の処理を続行
            console.error(`Error processing cart item ${item.id}:`, itemError);
            return {
              ...item,
              lastSeenPrice: item.lastSeenPrice ?? 0,
              currentPrice: 0,  // エラー時は0を返す
              priceJustChanged: false,
              error: 'Failed to process this item'
            };
          }
        })
      );

      return NextResponse.json(processedCartItems);
    } catch (mappingError) {
      console.error('Failed during cart items processing:', mappingError);
      return NextResponse.json({ error: 'Failed to process cart items' }, { status: 500 });
    }
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

    // 最新価格を取得 (注文処理APIと同様のエラーハンドリング)
    const currentPrice = await getCurrentProductPrice(productId);
    if (currentPrice === null) {
      return NextResponse.json({ error: `Price not set for product ${product?.name ?? productId}` }, { status: 400 });
    }

    const upsertedCartItem = await prisma.cart.upsert({
      where: {
        userId_productId: {
          userId: userId,
          productId: productId,
        },
      },
      update: {
        quantity: quantity,
        lastSeenPrice: currentPrice, // ★ 更新時も lastSeenPrice を現在の価格で更新
      },
      create: {
        userId: userId,
        productId: productId,
        quantity: quantity,
        lastSeenPrice: currentPrice, // ★ 作成時も lastSeenPrice を現在の価格で保存
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            stock: true,
            description: true,
          },
        },
      }
    });

    // レスポンスに必要な情報を結合して返す
    const responseCartItem = {
      ...upsertedCartItem,
      currentPrice: currentPrice, // 取得した最新価格
      // lastSeenPrice は upsertedCartItem に含まれている
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
