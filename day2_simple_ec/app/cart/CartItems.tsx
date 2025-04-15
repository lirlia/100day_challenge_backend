'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '../components/CartContext';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../components/UserSwitcher';

// 価格変更された商品の情報を表示するコンポーネント
type PriceChangeAlertProps = {
  changedItems: {
    productId: number;
    productName: string;
    oldPrice: number;
    newPrice: number;
  }[];
  onClose: () => void;
};

function PriceChangeAlert({ changedItems, onClose }: PriceChangeAlertProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  return (
    <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4 relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-yellow-800"
        aria-label="閉じる"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      <p className="font-bold mb-2">以下の商品の価格が変更されました。カートを自動的に更新しました。</p>
      <ul className="list-disc pl-5">
        {changedItems.map((item) => (
          <li key={item.productId} className="mb-1">
            <span className="font-medium">{item.productName}</span>:
            <span className="line-through text-gray-500 mx-1">{formatPrice(item.oldPrice)}</span>
            <span className="text-green-600 font-medium">→ {formatPrice(item.newPrice)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2">この価格で注文を続けるには、再度「注文を確定する」ボタンを押してください。</p>
    </div>
  );
}

export default function CartItems() {
  const { cartItems, updateCartItem, removeFromCart, clearCart, totalAmount, itemCount, priceChangedItems } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChangedAlert, setPriceChangedAlert] = useState<{
    changedItems: {
      productId: number;
      productName: string;
      oldPrice: number;
      newPrice: number;
    }[];
  } | null>(null);
  const router = useRouter();
  const { currentUser } = useUser();

  // カートを再取得する関数
  const refreshCart = async () => {
    if (!currentUser) return;

    try {
      const response = await fetch(`/api/cart?userId=${currentUser.id}`);
      if (!response.ok) throw new Error('Failed to refresh cart');
    } catch (error) {
      console.error('Error refreshing cart:', error);
    }
  };

  // 数量変更のハンドラー
  const handleQuantityChange = (
    cartItemId: number,
    currentQuantity: number,
    change: number
  ) => {
    const newQuantity = currentQuantity + change;
    if (newQuantity <= 0) {
      removeFromCart(cartItemId);
    } else {
      updateCartItem(cartItemId, newQuantity);
    }
  };

  // 注文処理のハンドラー
  const handleCheckout = async () => {
    if (!currentUser) return;

    setIsProcessing(true);
    setError(null);
    setPriceChangedAlert(null);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 409エラー（価格変更）の場合の特別な処理
        if (response.status === 409 && data.shouldUpdateCart && data.changedItems) {
          // 価格変更のアラートを表示
          setPriceChangedAlert({
            changedItems: data.changedItems
          });

          // カートを自動的に更新
          await refreshCart();

          // エラーを表示せず、アラートだけ表示
          setError(null);
        } else {
          // その他のエラーは通常通り表示
          throw new Error(data.error || '注文処理に失敗しました');
        }
      } else {
        // 注文成功時の処理（変更なし）
        await clearCart();
        router.push(`/orders/${data.id}?success=true`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setError(error instanceof Error ? error.message : '注文処理に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // 価格を日本円表示にフォーマット
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  if (cartItems.length === 0) {
    return (
      <div className="text-center py-8">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-16 h-16 mx-auto text-gray-400 mb-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
        <p className="text-gray-600 mb-4">カートに商品がありません</p>
        <Link href="/" className="text-blue-600 hover:underline">
          商品を探す
        </Link>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {priceChangedAlert && (
        <PriceChangeAlert
          changedItems={priceChangedAlert.changedItems}
          onClose={() => setPriceChangedAlert(null)}
        />
      )}

      <ul className="divide-y">
        {cartItems.map((item) => {
          const hasPriceChanged = priceChangedItems.has(item.id);

          return (
            <li key={item.id} className="py-6 flex">
              <div className="flex-shrink-0 relative w-24 h-24 rounded overflow-hidden border">
                <Image
                  src={item.product.imageUrl}
                  alt={item.product.name}
                  fill
                  sizes="100px"
                  className="object-contain"
                />
              </div>

              <div className="ml-4 flex-1">
                <div className="flex justify-between">
                  <div>
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-lg font-medium text-gray-900 hover:text-blue-600"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mt-1 text-gray-500">
                      単価: {formatPrice(item.currentPrice)}
                      {hasPriceChanged && (
                        <span className="ml-2 text-sm text-orange-600 font-medium">
                          (価格が変更されました)
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-lg font-medium text-gray-900">
                    {formatPrice(item.currentPrice * item.quantity)}
                  </p>
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, item.quantity, -1)}
                      className="p-1 rounded-full text-gray-600 hover:bg-gray-100"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M18 12H6"
                        />
                      </svg>
                    </button>
                    <span className="mx-2 text-gray-700">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.id, item.quantity, 1)}
                      disabled={item.quantity >= item.product.stock}
                      className={`p-1 rounded-full text-gray-600 ${
                        item.quantity >= item.product.stock
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6v12m6-6H6"
                        />
                      </svg>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    削除
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 border-t pt-8">
        <div className="flex justify-between text-lg font-medium mb-2">
          <p>小計 ({itemCount}点)</p>
          <p>{formatPrice(totalAmount)}</p>
        </div>
        <div className="flex justify-between text-lg font-medium mb-6">
          <p>合計</p>
          <p className="text-xl text-blue-700">{formatPrice(totalAmount)}</p>
        </div>

        <button
          type="button"
          onClick={handleCheckout}
          disabled={isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-medium"
        >
          {isProcessing ? '処理中...' : '注文を確定する'}
        </button>
      </div>
    </div>
  );
}
