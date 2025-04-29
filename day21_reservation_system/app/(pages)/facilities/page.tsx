'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { Facility } from '@prisma/client'; // Assuming Facility type is available

const FacilitiesPage = () => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState<number | string>('');
  const [availableStartTime, setAvailableStartTime] = useState('');
  const [availableEndTime, setAvailableEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFacilities = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/facilities');
      if (!response.ok) {
        throw new Error('Failed to fetch facilities');
      }
      const data = await response.json();
      setFacilities(data);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFacilities();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const capacityValue = capacity === '' ? null : Number(capacity);
    const startTimeValue = availableStartTime === '' ? null : availableStartTime;
    const endTimeValue = availableEndTime === '' ? null : availableEndTime;

    try {
      const response = await fetch('/api/facilities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description,
          capacity: capacityValue,
          availableStartTime: startTimeValue,
          availableEndTime: endTimeValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create facility');
      }

      // Reset form and refetch facilities
      setName('');
      setDescription('');
      setCapacity('');
      setAvailableStartTime('');
      setAvailableEndTime('');
      await fetchFacilities(); // Refetch to show the new facility
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during submission');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this facility?')) return;

    setError(null);
    try {
      const response = await fetch(`/api/facilities/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        let errorMsg = 'Failed to delete facility';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      await fetchFacilities(); // Refetch after deletion
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred during deletion');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">設備管理</h1>

      {/* Facility Creation Form */}
      <div className="mb-8 p-4 border rounded shadow-sm bg-white">
        <h2 className="text-xl font-semibold mb-3">新規設備追加</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">設備名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">説明</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="capacity" className="block text-sm font-medium text-gray-700">定員 (任意)</label>
              <input
                type="number"
                id="capacity"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                min="1"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="start-time" className="block text-sm font-medium text-gray-700">利用可能開始時間 (HH:mm, 任意)</label>
              <input
                type="time"
                id="start-time"
                value={availableStartTime}
                onChange={(e) => setAvailableStartTime(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="end-time" className="block text-sm font-medium text-gray-700">利用可能終了時間 (HH:mm, 任意)</label>
              <input
                type="time"
                id="end-time"
                value={availableEndTime}
                onChange={(e) => setAvailableEndTime(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">エラー: {error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isSubmitting ? '追加中...' : '設備を追加'}
          </button>
        </form>
      </div>

      {/* Facilities List */}
      <h2 className="text-xl font-semibold mb-3">登録済み設備一覧</h2>
      {isLoading ? (
        <p>設備情報を読み込み中...</p>
      ) : facilities.length > 0 ? (
        <ul className="space-y-3">
          {facilities.map((facility) => (
            <li key={facility.id} className="p-4 border rounded shadow-sm bg-white flex justify-between items-center">
              <div>
                <Link href={`/facilities/${facility.id}`} className="text-lg font-medium text-blue-600 hover:underline">
                    {facility.name}
                </Link>
                <p className="text-sm text-gray-600">{facility.description}</p>
                <p className="text-sm text-gray-500">
                  定員: {facility.capacity ?? '未設定'} | 利用可能時間: {facility.availableStartTime ?? '指定なし'} - {facility.availableEndTime ?? '指定なし'}
                </p>
              </div>
               <button
                  onClick={() => handleDelete(facility.id)}
                  className="ml-4 py-1 px-3 border border-red-500 text-red-500 rounded hover:bg-red-50 text-sm"
               >
                  削除
               </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>登録されている設備はありません。上のフォームから追加してください。</p>
      )}
    </div>
  );
};

export default FacilitiesPage;
