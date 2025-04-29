'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useUserStore } from '@/lib/store/userStore';
import { Reservation, Facility } from '@prisma/client'; // Assuming types
import { format } from 'date-fns/format'; // Correct import
import { ja } from 'date-fns/locale/ja'; // Import Japanese locale

// Type for reservation with facility details
interface MyReservation extends Omit<Reservation, 'startTime' | 'endTime'> {
    startTime: string; // Keep as string from API initially
    endTime: string;
    facility: Pick<Facility, 'id' | 'name'>;
}

const MyReservationsPage = () => {
  const { currentUser } = useUserStore();
  const [myReservations, setMyReservations] = useState<MyReservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMyReservations = useCallback(async () => {
    if (!currentUser) {
      setMyReservations([]);
      return; // No user selected
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reservations?userId=${currentUser.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch reservations');
      }
      const data: MyReservation[] = await response.json();
      setMyReservations(data);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
      setMyReservations([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchMyReservations();
  }, [fetchMyReservations]); // Refetch when user changes

  const handleCancel = async (reservationId: number) => {
    if (!confirm('この予約をキャンセルしてもよろしいですか？')) return;

    setError(null);
    try {
      const response = await fetch(`/api/reservations/${reservationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        let errorMsg = '予約のキャンセルに失敗しました';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      // Refetch reservations after cancellation
      await fetchMyReservations();
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during cancellation');
    }
  };

  if (!currentUser) {
    return <p>マイ予約を表示するには、ヘッダーからユーザーを選択してください。</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">マイ予約 ({currentUser.name})</h1>

      {isLoading && <p>予約情報を読み込み中...</p>}
      {error && <p className="text-red-500 mb-4">エラー: {error}</p>}

      {!isLoading && myReservations.length === 0 && !error && (
        <p>予約はありません。</p>
      )}

      {!isLoading && myReservations.length > 0 && (
        <ul className="space-y-4">
          {myReservations.map((reservation) => (
            <li key={reservation.id} className="p-4 border rounded shadow-sm bg-white flex justify-between items-center">
              <div>
                <p className="font-semibold text-lg">{reservation.facility.name}</p>
                <p className="text-gray-700">
                  {format(new Date(reservation.startTime), 'PPP p', { locale: ja })} - {format(new Date(reservation.endTime), 'p', { locale: ja })}
                </p>
                <p className="text-sm text-gray-500">予約日時: {format(new Date(reservation.createdAt), 'PP', { locale: ja })}</p>
              </div>
              <button
                onClick={() => handleCancel(reservation.id)}
                className="ml-4 py-1 px-3 border border-red-500 text-red-500 rounded hover:bg-red-50 text-sm"
              >
                予約をキャンセル
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyReservationsPage;
