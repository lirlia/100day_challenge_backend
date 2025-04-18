'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, ApiKeyInfo } from '@/lib/store'; // 型定義をインポート

// --- 型定義 --- //

interface RouteConfig {
  pathPrefix: string;
  targetUrl: string;
  stripPrefix: boolean;
}

interface GatewayResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

// --- Request Tester コンポーネント --- //

function RequestTester({ routePrefixes, apiKeys }: { routePrefixes: string[]; apiKeys: string[] }) {
  const [selectedPrefix, setSelectedPrefix] = useState<string>(routePrefixes[0] || '');
  const [pathSuffix, setPathSuffix] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(apiKeys[0] || '');
  const [response, setResponse] = useState<GatewayResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // routePrefixes が変更されたら選択肢をリセット
    if (routePrefixes.length > 0) {
      setSelectedPrefix(routePrefixes[0]);
    }
  }, [routePrefixes]);

  useEffect(() => {
    // apiKeys が変更されたら選択肢をリセット
    if (apiKeys.length > 0) {
      setApiKey(apiKeys[0]);
    }
  }, [apiKeys]);


  const handleSendRequest = async () => {
    if (!selectedPrefix) return;
    setIsLoading(true);
    setResponse(null);
    const fullPath = selectedPrefix + pathSuffix;
    try {
      const startTime = performance.now();
      const res = await fetch(fullPath, {
        method: 'GET', // 簡単化のためGETのみ
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const endTime = performance.now();

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let bodyText = '';
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
            const jsonBody = await res.json();
            bodyText = JSON.stringify(jsonBody, null, 2);
        } catch (e) {
            bodyText = "Error parsing JSON response body";
        }
      } else if (contentType && contentType.startsWith('text/')) {
        bodyText = await res.text();
      } else {
          bodyText = "(Non-text or non-JSON response)";
          // Blob を扱う場合など、必要に応じて拡張
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers,
        body: bodyText,
      });
      console.log(`Request to ${fullPath} took ${endTime - startTime}ms`);

    } catch (error) {
      console.error('Error sending request:', error);
      setResponse({
        status: 0,
        statusText: 'Fetch Error',
        headers: {},
        body: '',
        error: error instanceof Error ? error.message : 'Unknown fetch error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="text-xl font-semibold mb-2">Request Tester</h2>

      <div>
        <label htmlFor="routePrefix" className="block text-sm font-medium mb-1">Route Prefix:</label>
        <select
          id="routePrefix"
          value={selectedPrefix}
          onChange={(e) => setSelectedPrefix(e.target.value)}
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          disabled={routePrefixes.length === 0}
        >
          {routePrefixes.map((prefix) => (
            <option key={prefix} value={prefix}>{prefix}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="pathSuffix" className="block text-sm font-medium mb-1">Path Suffix:</label>
        <input
          id="pathSuffix"
          type="text"
          value={pathSuffix}
          onChange={(e) => setPathSuffix(e.target.value)}
          placeholder="/optional/path/params?query=val"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
        />
      </div>

       <div>
        <label htmlFor="apiKeySelect" className="block text-sm font-medium mb-1">API Key:</label>
        <select
          id="apiKeySelect"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          disabled={apiKeys.length === 0}
        >
          {apiKeys.map((key) => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSendRequest}
        disabled={isLoading || !selectedPrefix || !apiKey}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isLoading ? 'Sending...' : 'Send GET Request'}
      </button>

      {response && (
        <div className="mt-4 border-t pt-4">
          <h3 className="font-semibold">Response:</h3>
          <div className={`p-2 rounded ${response.status >= 400 ? 'bg-red-100 dark:bg-red-900' : 'bg-green-100 dark:bg-green-900'}`}>
            <p><strong>Status:</strong> {response.status} {response.statusText}</p>
            {response.error && <p className="text-red-600 dark:text-red-400"><strong>Error:</strong> {response.error}</p>}
          </div>
          <div className="mt-2">
            <p><strong>Headers:</strong></p>
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
              {JSON.stringify(response.headers, null, 2)}
            </pre>
          </div>
          <div className="mt-2">
            <p><strong>Body:</strong></p>
            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {response.body}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Admin Panel コンポーネント --- //

function AdminPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [apiKeysInfo, setApiKeysInfo] = useState<ApiKeyInfo[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Rate Limit 更新用 State
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [newInterval, setNewInterval] = useState<string>('');
  const [newLimit, setNewLimit] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const fetchLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    setError('');
    try {
      const res = await fetch('/api/admin/logs');
      if (!res.ok) throw new Error(`Failed to fetch logs: ${res.statusText}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  const fetchApiKeysInfo = useCallback(async () => {
    setIsLoadingKeys(true);
    setError('');
    try {
      const res = await fetch('/api/admin/rate-limit');
      if (!res.ok) throw new Error(`Failed to fetch API key info: ${res.statusText}`);
      const data: ApiKeyInfo[] = await res.json();
      setApiKeysInfo(data);
      if (data.length > 0 && !selectedApiKey) {
        setSelectedApiKey(data[0].apiKey); // 初期選択
        setNewInterval(data[0].rateLimit?.interval.toString() || '');
        setNewLimit(data[0].rateLimit?.limit.toString() || '');
      }
    } catch (err) {
      console.error('Error fetching API keys info:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch API key info');
    } finally {
      setIsLoadingKeys(false);
    }
  }, [selectedApiKey]); // selectedApiKey 変更時にも呼び出す可能性があるため依存配列に含める

  useEffect(() => {
    fetchLogs();
    fetchApiKeysInfo();
    // ポーリングする場合
    // const logIntervalId = setInterval(fetchLogs, 5000); // 5秒ごと
    // return () => clearInterval(logIntervalId);
  }, [fetchLogs, fetchApiKeysInfo]);

  const handleApiKeySelectionChange = (apiKey: string) => {
      setSelectedApiKey(apiKey);
      const info = apiKeysInfo.find(k => k.apiKey === apiKey);
      if (info) {
          setNewInterval(info.rateLimit?.interval.toString() || '');
          setNewLimit(info.rateLimit?.limit.toString() || '');
      } else {
          setNewInterval('');
          setNewLimit('');
      }
  }

  const handleUpdateRateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApiKey) return;
    setIsUpdating(true);
    setError('');

    let rateLimitPayload: { interval: number; limit: number } | null = null;
    const intervalNum = parseInt(newInterval, 10);
    const limitNum = parseInt(newLimit, 10);

    if (!isNaN(intervalNum) && !isNaN(limitNum) && intervalNum > 0 && limitNum >= 0) {
        rateLimitPayload = { interval: intervalNum, limit: limitNum };
    } else if (newInterval === '' && newLimit === '') {
        rateLimitPayload = null; // 空欄の場合は無制限に
    } else {
        setError('Invalid Interval or Limit value. Both must be positive numbers, or both empty for unlimited.');
        setIsUpdating(false);
        return;
    }

    try {
      const res = await fetch('/api/admin/rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: selectedApiKey, rateLimit: rateLimitPayload }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Failed to update rate limit: ${res.statusText}`);
      }
      // 更新成功したら再取得
      await fetchApiKeysInfo();
      alert('Rate limit updated successfully!');
    } catch (err) {
      console.error('Error updating rate limit:', err);
      setError(err instanceof Error ? err.message : 'Failed to update rate limit');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="text-xl font-semibold mb-2">Admin Panel</h2>

      {error && <p className="text-red-500 mb-4">Error: {error}</p>}

      {/* --- Rate Limit Management --- */}
      <div className="border-b pb-4 mb-4">
         <h3 className="font-semibold mb-2">Rate Limit Settings</h3>
         {isLoadingKeys ? (
             <p>Loading API Key settings...</p>
         ) : (
            <form onSubmit={handleUpdateRateLimit} className="space-y-3">
                <div>
                    <label htmlFor="adminApiKeySelect" className="block text-sm font-medium mb-1">Select API Key:</label>
                    <select
                        id="adminApiKeySelect"
                        value={selectedApiKey}
                        onChange={(e) => handleApiKeySelectionChange(e.target.value)}
                        className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                        disabled={apiKeysInfo.length === 0}
                    >
                        {apiKeysInfo.map((info) => (
                        <option key={info.apiKey} value={info.apiKey}>
                            {info.apiKey}
                            {info.rateLimit ? ` (${info.rateLimit.limit} req / ${info.rateLimit.interval / 1000}s)` : ' (Unlimited)'}
                        </option>
                        ))}
                    </select>
                </div>
                 <div className="flex gap-2">
                    <div className="flex-1">
                        <label htmlFor="intervalInput" className="block text-sm font-medium mb-1">Interval (ms):</label>
                        <input
                            id="intervalInput"
                            type="number"
                            value={newInterval}
                            onChange={(e) => setNewInterval(e.target.value)}
                            placeholder="e.g., 60000 (for 1 min)"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            min="1"
                        />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="limitInput" className="block text-sm font-medium mb-1">Limit (requests):</label>
                        <input
                            id="limitInput"
                            type="number"
                            value={newLimit}
                            onChange={(e) => setNewLimit(e.target.value)}
                            placeholder="e.g., 10"
                            className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                            min="0"
                        />
                    </div>
                 </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Leave both blank for unlimited requests.</p>
                 <button
                    type="submit"
                    disabled={isUpdating || !selectedApiKey}
                    className="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                    >
                    {isUpdating ? 'Updating...' : 'Update Rate Limit'}
                </button>
            </form>
         )}
      </div>

      {/* --- Log Viewer --- */}
      <div>
        <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold">Gateway Logs</h3>
            <button
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                className="text-sm bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
                {isLoadingLogs ? 'Refreshing...' : 'Refresh Logs'}
            </button>
        </div>
        {isLoadingLogs && logs.length === 0 ? (
          <p>Loading logs...</p>
        ) : logs.length === 0 ? (
          <p>No logs yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto border rounded p-2 bg-gray-50 dark:bg-gray-800">
            <table className="min-w-full text-xs divide-y dark:divide-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Timestamp</th>
                  <th className="px-2 py-1 text-left">API Key</th>
                  <th className="px-2 py-1 text-left">Method</th>
                  <th className="px-2 py-1 text-left">Path</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Target</th>
                  <th className="px-2 py-1 text-left">IP</th>
                  <th className="px-2 py-1 text-left">Msg</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-600">
                {logs.map((log, index) => (
                  <tr key={index} className={`${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'} hover:bg-gray-100 dark:hover:bg-gray-600`}>
                    <td className="px-2 py-1 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                    <td className="px-2 py-1 truncate max-w-xs" title={log.apiKey || 'N/A'}>{log.apiKey || '-'}</td>
                    <td className="px-2 py-1">{log.method}</td>
                    <td className="px-2 py-1 truncate max-w-xs" title={log.path}>{log.path}</td>
                    <td className={`px-2 py-1 font-medium ${log.status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{log.status}</td>
                    <td className="px-2 py-1 truncate max-w-xs" title={log.targetUrl || 'N/A'}>{log.targetUrl || '-'}</td>
                    <td className="px-2 py-1">{log.ip}</td>
                    <td className="px-2 py-1 truncate max-w-xs" title={log.message || ''}>{log.message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main UI コンポーネント --- //

export default function ApiGatewayUI() {
   // API Routes と API Keys を Admin API から取得する
    const [routePrefixes, setRoutePrefixes] = useState<string[]>([]);
    const [apiKeys, setApiKeys] = useState<string[]>([]);
    const [loadingConfig, setLoadingConfig] = useState<boolean>(true);
    const [configError, setConfigError] = useState<string>('');

    // 設定ファイルからデータを取得するヘルパー関数（今回は使わないが参考）
    /*
    const fetchConfig = useCallback(async () => {
        setConfigError('');
        setLoadingConfig(true);
        try {
            // 本来は専用のAPIエンドポイント (/api/admin/config など) を用意すべき
            const routesRes = await fetch('/config/routes.json'); // これは通常動作しない
            const keysRes = await fetch('/config/apiKeys.json'); // これも通常動作しない

            if (!routesRes.ok || !keysRes.ok) {
                throw new Error('Failed to fetch configuration');
            }
            const routesData: RouteConfig[] = await routesRes.json();
            const keysData: Record<string, any> = await keysRes.json();

            setRoutePrefixes(routesData.map(r => r.pathPrefix));
            setApiKeys(Object.keys(keysData));
        } catch (err) {
            console.error('Error fetching config:', err);
            setConfigError(err instanceof Error ? err.message : 'Failed to load configuration');
            // 代替としてAdmin APIから取得する
            try {
                const keysInfoRes = await fetch('/api/admin/rate-limit');
                if (!keysInfoRes.ok) throw new Error('Failed to fetch API keys via admin API');
                const keysInfoData: ApiKeyInfo[] = await keysInfoRes.json();
                setApiKeys(keysInfoData.map(k => k.apiKey));
                // Routes はこの方法では取得できない。サーバーコンポーネントから渡すのが良い
            } catch (adminErr) {
                console.error('Error fetching keys via admin API:', adminErr);
                 setConfigError('Failed to load configuration from server.');
            }
        } finally {
            setLoadingConfig(false);
        }
    }, []);
    */

   // Admin APIからAPIキー情報を取得する関数
   const fetchKeysFromAdminApi = useCallback(async () => {
       setConfigError('');
       setLoadingConfig(true);
       try {
           const keysInfoRes = await fetch('/api/admin/rate-limit');
           if (!keysInfoRes.ok) throw new Error('Failed to fetch API keys via admin API');
           const keysInfoData: ApiKeyInfo[] = await keysInfoRes.json();
           setApiKeys(keysInfoData.map(k => k.apiKey));
           // routes.json はクライアントサイドから安全に取得する方法がないためハードコードするか、
           // サーバーコンポーネントから渡すか、専用APIを作る必要がある。
           // ここでは管理画面に表示されているキーリストのみを使うため、一旦これでよしとする。
           // RequestTester 用の RoutePrefix は、現状ハードコードするか、別途取得手段を設ける必要がある。
           // 今回はサンプルとして固定値を入れる。（本来は動的にすべき）
           setRoutePrefixes(['/api/gateway/time', '/api/gateway/random', '/api/gateway/external/picsum']);
       } catch (adminErr) {
           console.error('Error fetching keys via admin API:', adminErr);
            setConfigError('Failed to load API Key configuration from server.');
       } finally {
           setLoadingConfig(false);
       }
   }, []);


    useEffect(() => {
        fetchKeysFromAdminApi();
    }, [fetchKeysFromAdminApi]);

  return (
    <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8">
      {loadingConfig && <p>Loading configuration...</p>}
      {configError && <p className="text-red-500 col-span-full">Error loading configuration: {configError}</p>}
      {!loadingConfig && !configError && (
          <>
            <RequestTester routePrefixes={routePrefixes} apiKeys={apiKeys} />
            <AdminPanel />
          </>
      )}
    </div>
  );
}
