'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '../components/CartContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../components/UserSwitcher';

export default function CartItems() {
  const { cartItems, updateCartItem, removeFromCart, totalAmount, itemCount } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { currentUser } = useUser();

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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '注文処理に失敗しました');
      }

      const order = await response.json();
      router.push(`/orders/${order.id}?success=true`);
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

      <ul className="divide-y">
        {cartItems.map((item) => (
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
                    単価: {formatPrice(item.product.price)}
                  </p>
                </div>
                <p className="text-lg font-medium text-gray-900">
                  {formatPrice(item.product.price * item.quantity)}
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
        ))}
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
