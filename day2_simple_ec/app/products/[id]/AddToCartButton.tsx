'use client';

import { useState } from 'react';
import { useCart } from '@/app/components/CartContext';

type Product = {
  id: number;
  name: string;
  stock: number;
};

type AddToCartButtonProps = {
  product: Product;
  currentPrice: number | null;
};

export default function AddToCartButton({ product, currentPrice }: AddToCartButtonProps) {
  const { addToCart, isLoading: isCartLoading } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState('');

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0 && value <= product.stock) {
      setQuantity(value);
    }
  };

  const handleAddToCart = async () => {
    if (quantity <= 0 || quantity > product.stock) return;

    setIsAdding(true);
    setMessage('');

    try {
      await addToCart(product.id, quantity);
      setMessage('カートに追加しました');

      // 3秒後にメッセージを消す
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      setMessage('エラーが発生しました');
      console.error('Error adding to cart:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (product.stock <= 0) {
    return (
      <div className="mt-4">
        <button
          disabled
          className="w-full py-3 px-4 bg-gray-300 text-gray-500 rounded font-semibold cursor-not-allowed"
        >
          在庫切れ
        </button>
      </div>
    );
  }

  const isPriceAvailable = currentPrice !== null && currentPrice > 0;

  return (
    <div className="mt-4">
      <div className="flex items-center mb-4">
        <label htmlFor="quantity" className="mr-3 font-medium">
          数量:
        </label>
        <div className="flex border rounded overflow-hidden">
          <button
            type="button"
            onClick={() => quantity > 1 && setQuantity(quantity - 1)}
            disabled={!isPriceAvailable}
            className={`px-3 py-1 ${isPriceAvailable ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-200 cursor-not-allowed'}`}
          >
            -
          </button>
          <input
            type="number"
            id="quantity"
            name="quantity"
            min="1"
            max={product.stock}
            value={quantity}
            onChange={handleQuantityChange}
            disabled={!isPriceAvailable}
            className={`w-16 text-center border-x ${!isPriceAvailable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />
          <button
            type="button"
            onClick={() =>
              quantity < product.stock && setQuantity(quantity + 1)
            }
            disabled={!isPriceAvailable}
            className={`px-3 py-1 ${isPriceAvailable ? 'bg-gray-100 hover:bg-gray-200' : 'bg-gray-200 cursor-not-allowed'}`}
          >
            +
          </button>
        </div>
      </div>

      <button
        onClick={handleAddToCart}
        disabled={!isPriceAvailable || isAdding || isCartLoading || product.stock <= 0}
        className={`w-full py-3 px-4 text-white rounded font-semibold flex items-center justify-center ${
          !isPriceAvailable
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isAdding ? (
          <span>追加中...</span>
        ) : !isPriceAvailable ? (
          <span>価格情報なし</span>
        ) : (
          <span>カートに追加</span>
        )}
      </button>

      {message && (
        <p className="text-center text-green-600 mt-2">{message}</p>
      )}
    </div>
  );
}
