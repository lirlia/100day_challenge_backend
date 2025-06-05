'use client';

import { useState, useEffect } from 'react';
import { Product, CreateOrderRequest } from '@/app/types/order';
import { orderApi } from '@/app/lib/api';

interface OrderFormProps {
  userId: string;
  onOrderCreated: () => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export default function OrderForm({ userId, onOrderCreated }: OrderFormProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const fetchedProducts = await orderApi.getProducts();
      setProducts(fetchedProducts);
    } catch (error) {
      console.error('Failed to load products:', error);
      setError('商品の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item
        );
      } else {
        return [...prevCart, { product, quantity: 1 }];
      }
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
    } else {
      setCart(prevCart =>
        prevCart.map(item =>
          item.product.id === productId
            ? { ...item, quantity: Math.min(quantity, item.product.stock) }
            : item
        )
      );
    }
  };

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + (item.product.price * item.quantity), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setError('カートに商品を追加してください');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const orderData: CreateOrderRequest = {
        userId,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
      };

      const result = await orderApi.createOrder(orderData);
      setSuccess(`注文が作成されました！ 注文ID: ${result.id}`);
      setCart([]);
      onOrderCreated();

      // 成功メッセージを3秒後に消す
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Failed to create order:', error);
      setError('注文の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">新しい注文を作成</h2>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4">
            <p className="text-green-800 dark:text-green-200">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">商品一覧</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map((product) => (
                <div key={product.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">{product.name}</h4>
                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                      ¥{product.price.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{product.description}</p>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${product.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      在庫: {product.stock}個
                    </span>
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={product.stock === 0}
                      className={`px-3 py-1 rounded text-sm font-medium ${product.stock > 0
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                      {product.stock > 0 ? 'カートに追加' : '在庫切れ'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {cart.length > 0 && (
            <div className="mb-6">
              <h3 className="text-md font-medium text-gray-900 dark:text-white mb-4">カート</h3>
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">{item.product.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        ¥{item.product.price.toLocaleString()} × {item.quantity} = ¥{(item.product.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="w-8 h-8 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-gray-900 dark:text-white">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        disabled={item.quantity >= item.product.stock}
                        className={`w-8 h-8 rounded ${item.quantity < item.product.stock
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span className="text-gray-900 dark:text-white">合計金額:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">¥{getTotalAmount().toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={cart.length === 0 || submitting}
            className={`w-full py-3 px-4 rounded-lg font-medium ${cart.length > 0 && !submitting
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
          >
            {submitting ? '注文処理中...' : '注文を確定する'}
          </button>
        </form>
      </div>
    </div>
  );
}
