import { prisma } from '@/lib/db';
import ProductCard from './components/ProductCard';
import { getCurrentProductPrice } from '@/lib/priceUtils';

export default async function Home() {
  const products = await prisma.product.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  const productsWithPrices = await Promise.all(
    products.map(async (product) => {
      const currentPrice = await getCurrentProductPrice(product.id);
      return {
        ...product,
        price: currentPrice ?? 0,
      };
    })
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">シンプルECサイト</h1>
        <p className="text-gray-600">
          最新のテクノロジー製品をお手頃価格で。今すぐチェックして、あなたの生活をアップグレードしましょう。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {productsWithPrices.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {productsWithPrices.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">商品が見つかりませんでした。</p>
        </div>
      )}
    </div>
  );
}
