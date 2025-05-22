import { NextResponse } from 'next/server';

// 航空券予約API (モック)
export async function POST(request: Request) {
  try {
    console.log('Flight reservation API called');
    await new Promise(resolve => setTimeout(resolve, 1200));
    if (Math.random() > 0.2) {
      return NextResponse.json({ message: 'Flight booked successfully', reservationId: `flight-${Date.now()}` });
    } else {
      return NextResponse.json({ error: 'Flight booking failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in flight reservation API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 航空券予約キャンセルAPI (モック)
export async function DELETE(request: Request) {
  try {
    console.log('Flight cancellation API called');
    await new Promise(resolve => setTimeout(resolve, 600));
    return NextResponse.json({ message: 'Flight Canceled successfully' });
  } catch (error) {
    console.error('Error in flight cancellation API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
