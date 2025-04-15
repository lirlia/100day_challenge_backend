'use client';

import { useEffect } from 'react';
import { useUser } from '@/app/components/UserSwitcher';

type UpdateLastSeenPriceProps = {
  productId: number;
};

export default function UpdateLastSeenPrice({ productId }: UpdateLastSeenPriceProps) {
  const { currentUser } = useUser();

  useEffect(() => {
    // ユーザーが未選択、または商品IDが不正な場合は何もしない
    if (!currentUser || !productId) return;

    // 最新価格を見たことを記録する非同期関数
    const updateLastSeenPrice = async () => {
      try {
        const response = await fetch('/api/cart/update-last-seen', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: currentUser.id,
            productId: productId,
          }),
        });

        if (!response.ok) {
          // エラーが発生してもユーザーエクスペリエンスに影響しないため、静かに失敗
          console.error('Failed to update last seen price');
          return;
        }

        const data = await response.json();

        // 更新があった場合のみログ出力
        if (data.updated) {
          console.log('Updated last seen price for product', productId);
        }
      } catch (error) {
        console.error('Error updating last seen price:', error);
      }
    };

    // コンポーネントがマウントされたときに一度だけ実行
    updateLastSeenPrice();
  }, [currentUser, productId]); // 依存配列に currentUser と productId を指定

  // このコンポーネントは UI を持たないので null を返す
  return null;
}
