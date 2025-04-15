'use client';

type OrderStatusProps = {
  status: string;
};

export default function OrderStatus({ status }: OrderStatusProps) {
  // ステータスに応じたスタイルとラベルを設定
  let statusStyle = '';
  let statusLabel = '';

  switch (status) {
    case 'completed':
      statusStyle = 'bg-green-100 text-green-800';
      statusLabel = '完了';
      break;
    case 'cancelled':
      statusStyle = 'bg-red-100 text-red-800';
      statusLabel = 'キャンセル';
      break;
    default:
      statusStyle = 'bg-yellow-100 text-yellow-800';
      statusLabel = '処理中';
  }

  return (
    <span
      className={`${statusStyle} px-3 py-1 rounded-full text-sm font-semibold`}
    >
      {statusLabel}
    </span>
  );
}
