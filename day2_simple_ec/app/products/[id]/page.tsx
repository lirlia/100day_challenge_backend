import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import AddToCartButton from './AddToCartButton';
import Link from 'next/link';
import { getCurrentProductPrice } from '@/lib/priceUtils';
import PriceHistoryChart from './PriceHistoryChart';
import UpdateLastSeenPrice from './UpdateLastSeenPrice';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const resolvedParams = await params;
  const productId = parseInt(resolvedParams.id);

  if (isNaN(productId)) {
    notFound();
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    notFound();
  }

  const currentPrice = await getCurrentProductPrice(productId);

  const formattedPrice = currentPrice === null || currentPrice === 0
    ? '価格情報なし'
    : new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY',
      }).format(currentPrice);

  return (
    <div>
      <UpdateLastSeenPrice productId={productId} />

      <div className="mb-4">
        <Link
          href="/"
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
          商品一覧に戻る
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="md:flex">
          <div className="md:w-1/2 p-4">
            <div className="relative w-full h-80">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain"
              />
            </div>
          </div>

          <div className="md:w-1/2 p-6">
            <h1 className="text-2xl font-bold mb-4">{product.name}</h1>
            <p className="text-gray-700 mb-6">{product.description}</p>

            <div className="flex justify-between items-center mb-6">
              <p className="text-3xl font-bold text-gray-900">
                {formattedPrice}
              </p>
              <p
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  product.stock > 0
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {product.stock > 0
                  ? `在庫あり (残り${product.stock}点)`
                  : '在庫切れ'}
              </p>
            </div>

            <AddToCartButton product={product} currentPrice={currentPrice} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <PriceHistoryChart productId={productId} />
      </div>
    </div>
  );
}
