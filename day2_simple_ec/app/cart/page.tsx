import CartItems from './CartItems';
import Link from 'next/link';

export default function CartPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ショッピングカート</h1>

      <div className="bg-white rounded-lg shadow-md p-6">
        <CartItems />

        <div className="border-t pt-4 mt-6">
          <div className="flex justify-between items-center mb-4">
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
              買い物を続ける
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
