'use client';

import { useState, useEffect } from 'react';

interface BookingDetail {
  status: string;
  reservationId?: string;
  error?: string;
}

interface SagaResponse {
  message?: string;
  details?: Record<string, BookingDetail>;
  error?: string;
  sagaId?: string;
}

const SAGA_STEPS = [
  { key: 'hotel', label: 'ホテル予約' },
  { key: 'flight', label: '航空券予約' },
  { key: 'car', label: 'レンタカー予約' },
];

function StepTimeline({ sagaId, onRetry, disabled, onFinalStatusChange }: { sagaId: string, onRetry: () => void, disabled: boolean, onFinalStatusChange: (status: 'success' | 'failed' | null) => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [finalStatus, setFinalStatus] = useState<'success' | 'failed' | null>(null);
  // 段階的に表示する補償ログのインデックス
  const [compLogIndex, setCompLogIndex] = useState(0);

  useEffect(() => {
    if (!sagaId) return;
    setIsPolling(true);
    setFinalStatus(null);
    onFinalStatusChange(null);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/saga_logs?sagaId=${sagaId}`);
        const data = await res.json();
        setLogs(data.logs || []);
        // 成功・失敗判定
        const last = data.logs?.slice().reverse().find((l: any) => l.status === 'FAILED' || l.status === 'SUCCESS');
        if (last?.status === 'FAILED') {
          setFinalStatus('failed');
          setIsPolling(false);
          onFinalStatusChange('failed');
        } else if (SAGA_STEPS.every(step => data.logs?.some((l: any) => l.step_name === step.key && l.status === 'SUCCESS'))) {
          setFinalStatus('success');
          setIsPolling(false);
          onFinalStatusChange('success');
        }
      } catch (e) {
        // ignore
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sagaId]);

  // ステップごとの状態取得
  const getStepStatus = (stepKey: string) => {
    const executing = logs.find((l) => l.step_name === stepKey && l.status === 'EXECUTING');
    const success = logs.find((l) => l.step_name === stepKey && l.status === 'SUCCESS');
    const failed = logs.find((l) => l.step_name === stepKey && l.status === 'FAILED');
    const compensating = logs.find((l) => l.step_name === `${stepKey}_compensation` && l.status === 'COMPENSATING');
    const compensated = logs.find((l) => l.step_name === `${stepKey}_compensation` && l.status === 'COMPENSATED_SUCCESS');
    const compFailed = logs.find((l) => l.step_name === `${stepKey}_compensation` && l.status === 'COMPENSATED_FAILED');
    if (failed) return 'failed';
    if (success) return 'success';
    if (compensating) return 'compensating';
    if (compensated) return 'compensated';
    if (compFailed) return 'compensate_failed';
    if (executing) return 'executing';
    return 'pending';
  };

  // 補償ログ抽出
  const compensationLogs = logs.filter((l) =>
    l.step_name.endsWith('_compensation') &&
    (l.status === 'COMPENSATING' || l.status === 'COMPENSATED_SUCCESS' || l.status === 'COMPENSATED_FAILED')
  ).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));

  // 段階的表示ロジック
  useEffect(() => {
    if (compensationLogs.length === 0) {
      setCompLogIndex(0);
      return;
    }
    if (compLogIndex < compensationLogs.length) {
      const timer = setTimeout(() => {
        setCompLogIndex((prev) => prev + 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [compensationLogs.length, compLogIndex]);

  // 表示する補償ログ
  const visibleCompLogs = compensationLogs.slice(0, compLogIndex);

  return (
    <div className="my-8">
      <div className="flex justify-between items-center gap-4">
        {SAGA_STEPS.map((step, idx) => {
          const status = getStepStatus(step.key);
          let color = 'bg-slate-600';
          let icon = null;
          if (status === 'executing') { color = 'bg-blue-500 animate-pulse'; icon = <span className="animate-spin">🔄</span>; }
          if (status === 'success') { color = 'bg-green-500'; icon = '✅'; }
          if (status === 'failed') { color = 'bg-red-500'; icon = '❌'; }
          if (status === 'compensating') { color = 'bg-orange-500 animate-pulse'; icon = '↩️'; }
          if (status === 'compensated') { color = 'bg-yellow-400 text-black'; icon = '🟡'; }
          if (status === 'compensate_failed') { color = 'bg-red-700'; icon = '⚠️'; }
          if (status === 'pending') { color = 'bg-slate-600'; icon = '⏳'; }
          return (
            <div key={step.key} className="flex flex-col items-center flex-1">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl font-bold mb-2 ${color}`}>{icon}</div>
              <span className="text-sm text-slate-200">{step.label}</span>
            </div>
          );
        })}
      </div>
      {finalStatus === 'failed' && (
        <div className="mt-6 flex flex-col items-center">
          <span className="text-red-400 font-bold mb-2">サガが失敗しました</span>
          <button onClick={onRetry} disabled={disabled} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white font-semibold disabled:opacity-50">再実行</button>
        </div>
      )}
      {finalStatus === 'success' && (
        <div className="mt-6 text-green-400 font-bold text-center">すべての予約が成功しました！</div>
      )}
      {/* 補償ログパネル */}
      {visibleCompLogs.length > 0 && (
        <div className="mt-8 bg-slate-700 rounded-lg p-4">
          <h3 className="text-md font-semibold text-orange-300 mb-2">補償処理ログ</h3>
          <ul className="space-y-1 text-sm">
            {visibleCompLogs.map((log, idx) => (
              <li key={log.id || idx} className="flex items-center gap-2">
                <span className="font-mono text-slate-400">[{log.created_at?.slice(11, 19) || '--:--:--'}]</span>
                <span className="text-slate-200">{log.step_name.replace('_compensation', '')}</span>
                {log.status === 'COMPENSATING' && <span className="text-orange-400 animate-pulse">補償中...</span>}
                {log.status === 'COMPENSATED_SUCCESS' && <span className="text-yellow-300">補償成功</span>}
                {log.status === 'COMPENSATED_FAILED' && <span className="text-red-400">補償失敗</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TravelPage() {
  const [userId, setUserId] = useState<string>('user-' + Math.random().toString(36).substring(2, 7));
  const [tripDetails, setTripDetails] = useState<string>('{\n  "destination": "Kyoto",\n  "duration": "3 days",\n  "travelers": 2,\n  "preferences": {\n    "hotel": "4-star",\n    "flight": "non-stop",\n    "car": "SUV"\n  }\n}');
  const [response, setResponse] = useState<SagaResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sagaId, setSagaId] = useState<string | null>(null);
  const [timelineStatus, setTimelineStatus] = useState<'success' | 'failed' | null>(null);
  const [failPattern, setFailPattern] = useState<'none' | 'hotel' | 'flight' | 'car'>('none');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResponse(null);
    setSagaId(null);

    try {
      let parsedTripDetails;
      try {
        parsedTripDetails = JSON.parse(tripDetails);
      } catch (parseError) {
        setResponse({ error: 'Invalid JSON format for Trip Details.' });
        setIsLoading(false);
        return;
      }

      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tripDetails: parsedTripDetails }),
      });
      const data: SagaResponse = await res.json();
      setResponse(data);
      if (data.sagaId) setSagaId(data.sagaId);
    } catch (error) {
      console.error('Error submitting travel request:', error);
      setResponse({ error: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (!tripDetails || !userId) return;
    setSagaId(null);
    setResponse(null);
    setTimeout(() => {
      // フォーム送信を再実行
      const fakeEvent = { preventDefault: () => { } } as React.FormEvent;
      handleSubmit(fakeEvent);
    }, 100);
  };

  const handleSimulate = async (pattern: 'none' | 'hotel' | 'flight' | 'car') => {
    setIsLoading(true);
    setResponse(null);
    setSagaId(null);
    setFailPattern(pattern);

    let forcedStepResults: any = {};
    if (pattern === 'hotel') forcedStepResults = { hotel: 'fail' };
    if (pattern === 'flight') forcedStepResults = { flight: 'fail' };
    if (pattern === 'car') forcedStepResults = { car: 'fail' };

    try {
      let parsedTripDetails;
      try {
        parsedTripDetails = JSON.parse(tripDetails);
      } catch (parseError) {
        setResponse({ error: 'Invalid JSON format for Trip Details.' });
        setIsLoading(false);
        return;
      }
      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tripDetails: parsedTripDetails, forcedStepResults }),
      });
      const data: SagaResponse = await res.json();
      setResponse(data);
      if (data.sagaId) setSagaId(data.sagaId);
    } catch (error) {
      console.error('Error submitting travel request:', error);
      setResponse({ error: 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col items-center py-10">
      <header className="mb-10">
        <h1 className="text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
          Day45 - Travel Booking Saga
        </h1>
        <p className="text-slate-400 text-center mt-2">Demonstrating Saga Pattern for distributed transactions.</p>
      </header>

      <main className="w-full max-w-2xl bg-slate-800 shadow-2xl rounded-lg p-8">
        <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-6">
          <div>
            <label htmlFor="userId" className="block text-sm font-medium text-emerald-300">
              User ID
            </label>
            <input
              type="text"
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 block w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-slate-100 placeholder-slate-400"
              placeholder="e.g., user-alpha-123"
              required
            />
          </div>

          <div>
            <label htmlFor="tripDetails" className="block text-sm font-medium text-emerald-300">
              Trip Details (JSON)
            </label>
            <textarea
              id="tripDetails"
              value={tripDetails}
              onChange={(e) => setTripDetails(e.target.value)}
              rows={10}
              className="mt-1 block w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-slate-100 placeholder-slate-400 font-mono"
              placeholder='e.g., { "destination": "Paris", "duration": "5days" }'
              required
            />
          </div>

          {/* シミュレーションボタン群 */}
          <div className="flex flex-wrap gap-4 justify-center mt-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSimulate('none')}
              className={`px-4 py-2 rounded font-semibold transition-colors duration-150 ${failPattern === 'none' ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-emerald-700'} text-white disabled:opacity-50`}
            >
              全成功シミュレート
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSimulate('hotel')}
              className={`px-4 py-2 rounded font-semibold transition-colors duration-150 ${failPattern === 'hotel' ? 'bg-red-600' : 'bg-slate-700 hover:bg-red-700'} text-white disabled:opacity-50`}
            >
              ホテル失敗シミュレート
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSimulate('flight')}
              className={`px-4 py-2 rounded font-semibold transition-colors duration-150 ${failPattern === 'flight' ? 'bg-red-600' : 'bg-slate-700 hover:bg-red-700'} text-white disabled:opacity-50`}
            >
              航空券失敗シミュレート
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleSimulate('car')}
              className={`px-4 py-2 rounded font-semibold transition-colors duration-150 ${failPattern === 'car' ? 'bg-red-600' : 'bg-slate-700 hover:bg-red-700'} text-white disabled:opacity-50`}
            >
              レンタカー失敗シミュレート
            </button>
          </div>
        </form>

        {/* タイムラインUI */}
        {sagaId && (
          <StepTimeline sagaId={sagaId} onRetry={handleRetry} disabled={isLoading} onFinalStatusChange={setTimelineStatus} />
        )}

        {response && timelineStatus && (
          <div className={`mt-8 p-6 rounded-lg shadow-md ${response.error ? 'bg-red-800 border-red-700' : 'bg-green-800 border-green-700'} border`}>
            <h2 className="text-xl font-semibold mb-3">
              {response.error ? 'Booking Failed' : 'Booking Status'}
            </h2>
            {response.sagaId && <p className="text-sm text-slate-300 mb-1">Saga ID: <span className="font-mono">{response.sagaId}</span></p>}

            {response.message && <p className="text-lg mb-2">{response.message}</p>}
            {response.error && <p className="text-lg text-red-200 mb-2">{response.error}</p>}

            {response.details && (
              <div className="mt-4 space-y-3">
                <h3 className="text-md font-medium text-slate-200">Service Details:</h3>
                {Object.entries(response.details).map(([service, detail]) => (
                  <div key={service} className={`p-3 rounded ${detail.status === 'booked' ? 'bg-green-700' : detail.status === 'failed' ? 'bg-red-700' : detail.status === 'compensated' ? 'bg-yellow-700 text-yellow-100' : 'bg-slate-700'}`}>
                    <p className="font-semibold capitalize text-slate-100">{service}: <span className={`font-normal ${detail.status === 'compensated' ? 'text-yellow-100' : 'text-slate-200'}`}>{detail.status}</span></p>
                    {detail.reservationId && <p className="text-xs text-slate-300">Reservation ID: <span className="font-mono">{detail.reservationId}</span></p>}
                    {detail.error && <p className="text-xs text-red-300">Error: {detail.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="mt-12 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} TravelSaga Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
