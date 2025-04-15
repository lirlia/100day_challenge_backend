'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCart } from './CartContext';
import { useState } from 'react';

// Product 型から price を必須ではなくする（または price: number | null のようにする）
// page.tsx で price: currentPrice ?? 0 としているので number でOK
type Product = {
  id: number;
  name: string;
  description: string;
  price: number; // page.tsx から渡される最新価格
  imageUrl: string;
  stock: number;
};

type ProductCardProps = {
  product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart, isLoading } = useCart();
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState('');

  const handleAddToCart = async () => {
    setIsAdding(true);
    setMessage('');

    try {
      await addToCart(product.id, 1);
      setMessage('カートに追加しました');

      // 3秒後にメッセージを消す
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage('エラーが発生しました');
    } finally {
      setIsAdding(false);
    }
  };

  // 渡された product.price をそのまま使う
  const formattedPrice = product.price === 0
    ? '価格情報なし' // 価格が見つからない、または0の場合の表示
    : new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
      }).format(product.price);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-full">
      <Link href={`/products/${product.id}`}>
        <div className="relative w-full h-48">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-contain"
          />
        </div>
      </Link>

      <div className="p-4 flex-grow">
        <Link href={`/products/${product.id}`}>
          <h3 className="text-lg font-semibold mb-2 hover:text-blue-600">
            {product.name}
          </h3>
        </Link>

        <p className="text-gray-600 mb-4 text-sm line-clamp-2">
          {product.description}
        </p>

        <div className="flex justify-between items-center">
          <p className="text-xl font-bold text-gray-900">{formattedPrice}</p>
          <p className="text-sm text-gray-500">在庫: {product.stock}</p>
        </div>
      </div>

      <div className="p-4 pt-0">
        <button
          onClick={handleAddToCart}
          disabled={isAdding || isLoading || product.stock <= 0}
          className={`w-full py-2 px-4 rounded font-semibold flex items-center justify-center
            ${
              product.stock <= 0
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          {isAdding ? (
            <span>追加中...</span>
          ) : product.stock <= 0 ? (
            <span>在庫切れ</span>
          ) : (
            <span>カートに追加</span>
          )}
        </button>

        {message && (
          <p className="text-center text-sm mt-2 text-green-600">{message}</p>
        )}
      </div>
    </div>
  );
}
