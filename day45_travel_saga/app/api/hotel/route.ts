import { NextResponse } from 'next/server';

// ホテル予約API (モック)
export async function POST(request: Request) {
  try {
    // TODO: 実際の予約処理
    console.log('Hotel reservation API called');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 擬似的な処理時間
    // ランダムで成功/失敗を返す
    if (Math.random() > 0.2) {
      return NextResponse.json({ message: 'Hotel reserved successfully', reservationId: `hotel-${Date.now()}` });
    } else {
      return NextResponse.json({ error: 'Hotel reservation failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in hotel reservation API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// ホテル予約キャンセルAPI (モック)
export async function DELETE(request: Request) {
  try {
    // TODO: 実際のキャンセル処理
    console.log('Hotel cancellation API called');
    await new Promise(resolve => setTimeout(resolve, 500));
    return NextResponse.json({ message: 'Hotel Canceled successfully' });
  } catch (error) {
    console.error('Error in hotel cancellation API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
