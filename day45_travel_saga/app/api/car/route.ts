import { NextResponse } from 'next/server';

// レンタカー予約API (モック)
export async function POST(request: Request) {
  try {
    console.log('Car rental API called');
    await new Promise(resolve => setTimeout(resolve, 800));
    if (Math.random() > 0.2) {
      return NextResponse.json({ message: 'Car rented successfully', reservationId: `car-${Date.now()}` });
    } else {
      return NextResponse.json({ error: 'Car rental failed' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in car rental API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// レンタカー予約キャンセルAPI (モック)
export async function DELETE(request: Request) {
  try {
    console.log('Car rental cancellation API called');
    await new Promise(resolve => setTimeout(resolve, 400));
    return NextResponse.json({ message: 'Car Rental Canceled successfully' });
  } catch (error) {
    console.error('Error in car rental cancellation API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
