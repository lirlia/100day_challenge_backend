import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import OrderStatus from './OrderStatus';

type OrderPageProps = {
  params: {
    id: string;
  };
  searchParams: {
    success?: string;
  };
};

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  // params と searchParams を await する
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const orderId = parseInt(resolvedParams.id);
  const showSuccessMessage = resolvedSearchParams.success === 'true';

  if (isNaN(orderId)) {
    notFound();
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
      user: true,
    },
  });

  if (!order) {
    notFound();
  }

  // 価格を日本円表示にフォーマット
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
    }).format(price);
  };

  // 日付をフォーマット
  const formatDate = (dateString: Date) => {
    return dateString.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/orders"
          className="text-blue-600 hover:underline flex items-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-4 h-4 mr-1"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          注文履歴に戻る
        </Link>
      </div>

      {showSuccessMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
          ご注文ありがとうございます！注文が正常に処理されました。
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold mb-2">注文 #{order.id}</h1>
              <p className="text-gray-600">
                注文日時: {formatDate(order.createdAt)}
              </p>
              <p className="text-gray-600">
                注文者: {order.user.name}
              </p>
            </div>
            <OrderStatus status={order.status} />
          </div>

          <div className="border-t border-b py-6 my-6">
            <h2 className="text-lg font-semibold mb-4">注文商品</h2>
            <ul className="divide-y">
              {order.orderItems.map((item) => (
                <li key={item.id} className="py-4 flex items-center">
                  <div className="w-16 h-16 flex-shrink-0 overflow-hidden rounded-md border border-gray-200">
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="ml-4 flex-1 flex flex-col">
                    <div>
                      <div className="flex justify-between text-base font-medium text-gray-900">
                        <h3>
                          <Link href={`/products/${item.product.id}`} className="hover:text-blue-600">
                            {item.product.name}
                          </Link>
                        </h3>
                        <p className="ml-4">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        単価: {formatPrice(item.price)} × {item.quantity}点
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-base">
              <p>小計</p>
              <p>{formatPrice(order.totalPrice)}</p>
            </div>
            <div className="flex justify-between text-base">
              <p>送料</p>
              <p>無料</p>
            </div>
            <div className="flex justify-between text-lg font-bold pt-4 border-t">
              <p>合計</p>
              <p>{formatPrice(order.totalPrice)}</p>
            </div>
          </div>

          <div className="mt-8">
            <Link href="/" className="text-blue-600 hover:underline">
              買い物を続ける
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
