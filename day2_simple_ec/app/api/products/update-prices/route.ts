import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentProductPrice } from '@/lib/priceUtils';

// POST ハンドラー: 商品価格の更新をトリガー
export async function POST(request: NextRequest) {
  console.log('Received request to update prices...'); // 処理開始ログ
  try {
    // 更新対象の商品IDを取得 (ここでは例として全商品を取得)
    const productsToUpdate = await prisma.product.findMany({
      select: { id: true, name: true }, // IDと名前のみ取得
    });

    let updatedCount = 0;

    for (const product of productsToUpdate) {
      const currentPrice = await getCurrentProductPrice(product.id);

      // 現在価格がない場合 (seed直後など) はスキップ、または初期価格を設定しても良い
      if (currentPrice === null) {
        console.log(`Skipping ${product.name} (ID: ${product.id}) - no current price found.`);
        continue;
      }

      // 新価格を計算 (例: 現在価格の ±10% の範囲でランダム変動)
      const priceChangePercentage = (Math.random() * 0.2) - 0.1; // -0.1 から +0.1 の範囲
      let newPrice = Math.round(currentPrice * (1 + priceChangePercentage));

      // 価格が極端に低くならないように下限を設定 (例: 100円)
      if (newPrice < 100) {
        newPrice = 100;
      }

      // 新しい価格履歴を作成
      await prisma.productPrice.create({
        data: {
          productId: product.id,
          price: newPrice,
          // startDate はデフォルトで現在時刻
        },
      });
      updatedCount++;
    }

    console.log(`Price update completed. Updated ${updatedCount} products.`); // 処理完了ログ
    return NextResponse.json({ message: `Successfully updated prices for ${updatedCount} products.` });

  } catch (error) {
    console.error('Failed to update product prices:', error);
    return NextResponse.json({ error: 'Failed to update product prices' }, { status: 500 });
  }
}
