'use client';

import Link from 'next/link';
import { useUser } from '../components/UserSwitcher';
import { useEffect, useState } from 'react';

type OrderItem = {
  id: number;
  quantity: number;
  price: number;
  product: {
    id: number;
    name: string;
    imageUrl: string;
  };
};

type Order = {
  id: number;
  totalPrice: number;
  status: string;
  createdAt: string;
  orderItems: OrderItem[];
};

export default function OrderHistory() {
  const { currentUser } = useUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!currentUser) {
        setOrders([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/orders?userId=${currentUser.id}`);

        if (!response.ok) {
          throw new Error('注文履歴の取得に失敗しました');
        }

        const data = await response.json();
        setOrders(data);
      } catch (error) {
        console.error('Error fetching orders:', error);
        setError('注文履歴の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [currentUser]);

  // 価格を日本円表示にフォーマット
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  // 日付をフォーマット
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <div className="text-center py-8">読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (orders.length === 0) {
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
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
        <p className="text-gray-600 mb-4">注文履歴がありません</p>
        <Link href="/" className="text-blue-600 hover:underline">
          商品を探す
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y">
        {orders.map((order) => (
          <li key={order.id} className="py-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Link
                  href={`/orders/${order.id}`}
                  className="text-lg font-medium text-blue-600 hover:underline"
                >
                  注文番号: {order.id}
                </Link>
                <p className="text-gray-500">{formatDate(order.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-medium">{formatPrice(order.totalPrice)}</p>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    order.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : order.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {order.status === 'completed'
                    ? '完了'
                    : order.status === 'cancelled'
                    ? 'キャンセル'
                    : '処理中'}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {order.orderItems.slice(0, 4).map((item) => (
                <div key={item.id} className="flex flex-col items-center text-center">
                  <Link
                    href={`/products/${item.product.id}`}
                    className="block hover:opacity-75"
                  >
                    <div className="relative w-16 h-16 mb-2">
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="object-contain w-full h-full"
                      />
                    </div>
                    <p className="text-xs text-gray-700 truncate w-full">
                      {item.product.name}
                    </p>
                  </Link>
                </div>
              ))}
              {order.orderItems.length > 4 && (
                <div className="flex items-center justify-center">
                  <p className="text-sm text-gray-500">
                    ...他{order.orderItems.length - 4}点
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <Link
                href={`/orders/${order.id}`}
                className="text-blue-600 hover:underline text-sm"
              >
                注文詳細を見る
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
