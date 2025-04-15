import OrderHistory from './OrderHistory';

export default function OrdersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">注文履歴</h1>
      <div className="bg-white rounded-lg shadow-md p-6">
        <OrderHistory />
      </div>
    </div>
  );
}
