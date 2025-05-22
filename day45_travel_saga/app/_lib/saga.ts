import db from '@/lib/db'; // デフォルトインポートに変更

interface SagaStep {
  name: string;
  execute: () => Promise<BookingResponse>;
  compensate: () => Promise<void>;
}

interface BookingResponse {
  success: boolean;
  reservationId?: string;
  error?: string;
}

// スタブ関数：ホテルの予約
async function bookHotel(): Promise<BookingResponse> {
  console.log('[Saga Step] Attempting to book hotel...');
  // 80%の確率で成功
  if (Math.random() < 0.8) {
    const reservationId = `hotel-${Date.now()}`;
    console.log(`[Saga Step] Hotel booked successfully: ${reservationId}`);
    return { success: true, reservationId };
  }
  console.error('[Saga Step] Hotel booking failed');
  return { success: false, error: 'Hotel booking failed' };
}

// スタブ関数：ホテルのキャンセル
async function cancelHotel(): Promise<void> {
  console.log('[Saga Step] Hotel booking cancelled.');
  return Promise.resolve(); // voidを返す
}

// スタブ関数：航空券の予約
async function bookFlight(): Promise<BookingResponse> {
  console.log('[Saga Step] Attempting to book flight...');
  // 70%の確率で成功
  if (Math.random() < 0.7) {
    const reservationId = `flight-${Date.now()}`;
    console.log(`[Saga Step] Flight booked successfully: ${reservationId}`);
    return { success: true, reservationId };
  }
  console.error('[Saga Step] Flight booking failed');
  return { success: false, error: 'Flight booking failed' };
}

// スタブ関数：航空券のキャンセル
async function cancelFlight(): Promise<void> {
  console.log('[Saga Step] Flight booking cancelled.');
  return Promise.resolve(); // voidを返す
}

// スタブ関数：レンタカーの予約
async function bookCar(): Promise<BookingResponse> {
  console.log('[Saga Step] Attempting to book car...');
  // 90%の確率で成功
  if (Math.random() < 0.9) {
    const reservationId = `car-${Date.now()}`;
    console.log(`[Saga Step] Car rented successfully: ${reservationId}`);
    return { success: true, reservationId };
  }
  console.error('[Saga Step] Car rental failed');
  return { success: false, error: 'Car rental failed' };
}

// スタブ関数：レンタカーのキャンセル
async function cancelCar(): Promise<void> {
  console.log('[Saga Step] Car rental cancelled.');
  return Promise.resolve(); // voidを返す
}

export async function handleSagaRequest(sagaId: string, userId: string, tripDetails: any) {
  console.log(`[Saga] Starting saga for userId: ${userId}, sagaId: ${sagaId}`, tripDetails);
  const steps: SagaStep[] = [
    { name: 'hotel', execute: bookHotel, compensate: cancelHotel },
    { name: 'flight', execute: bookFlight, compensate: cancelFlight },
    { name: 'car', execute: bookCar, compensate: cancelCar },
  ];

  const executedSteps: SagaStep[] = [];
  const bookingDetails: Record<string, any> = {};

  try {
    for (const step of steps) {
      console.log(`[Saga] Executing step: ${step.name} for sagaId: ${sagaId}`);
      db.prepare(
        'INSERT INTO saga_logs (saga_id, step_name, status, details, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
      ).run(sagaId, step.name, 'EXECUTING', null);

      const response = await step.execute();
      if (response.success) {
        console.log(`[Saga] Step ${step.name} successful for sagaId: ${sagaId}`, response);
        bookingDetails[step.name] = { status: 'booked', reservationId: response.reservationId };
        executedSteps.push(step);
        db.prepare(
          'UPDATE saga_logs SET status = ?, details = ? WHERE saga_id = ? AND step_name = ? AND status = ?'
        ).run('SUCCESS', JSON.stringify(response), sagaId, step.name, 'EXECUTING');
      } else {
        console.error(`[Saga] Step ${step.name} failed for sagaId: ${sagaId}`, response.error);
        bookingDetails[step.name] = { status: 'failed', error: response.error };
        db.prepare(
          'UPDATE saga_logs SET status = ?, details = ? WHERE saga_id = ? AND step_name = ? AND status = ?'
        ).run('FAILED', JSON.stringify(response), sagaId, step.name, 'EXECUTING');
        throw new Error(`Step ${step.name} failed: ${response.error}`);
      }
    }
    console.log(`[Saga] All steps successful for sagaId: ${sagaId}`, bookingDetails);
    return { success: true, details: bookingDetails };
  } catch (error: any) {
    console.error(`[Saga] Error during saga execution for sagaId: ${sagaId}, initiating compensation`, error.message);
    for (const step of executedSteps.slice().reverse()) {
      try {
        console.log(`[Saga] Compensating step: ${step.name} for sagaId: ${sagaId}`);
        db.prepare(
          'INSERT INTO saga_logs (saga_id, step_name, status, details, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))'
        ).run(sagaId, `${step.name}_compensation`, 'COMPENSATING', null);

        await step.compensate();
        console.log(`[Saga] Step ${step.name} compensated successfully for sagaId: ${sagaId}`);
        bookingDetails[step.name].status = 'compensated';
        db.prepare(
          'UPDATE saga_logs SET status = ? WHERE saga_id = ? AND step_name = ? AND status = ?'
        ).run('COMPENSATED_SUCCESS', sagaId, `${step.name}_compensation`, 'COMPENSATING');
      } catch (compError: any) {
        console.error(`[Saga] Error compensating step ${step.name} for sagaId: ${sagaId}`, compError.message);
        db.prepare(
          'UPDATE saga_logs SET status = ?, details = ? WHERE saga_id = ? AND step_name = ? AND status = ?'
        ).run('COMPENSATED_FAILED', JSON.stringify({error: compError.message}), sagaId, `${step.name}_compensation`, 'COMPENSATING');
      }
    }
    return { success: false, error: { message: error.message, details: bookingDetails } };
  }
}
