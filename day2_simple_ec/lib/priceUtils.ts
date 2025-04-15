import { prisma } from './db';

/**
 * 指定された商品IDの現在の有効価格を取得します。
 * 価格履歴が存在しない場合は null を返します。
 * @param productId 価格を取得する商品のID
 * @returns 最新の価格、または null
 */
export const getCurrentProductPrice = async (productId: number): Promise<number | null> => {
  const latestPriceEntry = await prisma.productPrice.findFirst({
    where: { productId: productId },
    orderBy: { startDate: 'desc' },
  });

  return latestPriceEntry ? latestPriceEntry.price : null;
};
