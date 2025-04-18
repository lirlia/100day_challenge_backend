import fs from 'fs';
import path from 'path';

// --- 型定義 ---
type RateLimitConfig = {
  interval: number; // ミリ秒
  limit: number;
};

export interface ApiKeyInfo {
  apiKey: string;
  rateLimit: RateLimitConfig | null;
}

interface RateLimitState {
  timestamps: number[];
}

export interface LogEntry {
  timestamp: string;
  apiKey: string | null;
  method: string;
  path: string;
  ip: string | null;
  status: number;
  targetUrl?: string;
  message?: string;
}

// --- 設定ファイルの読み込み ---
const CONFIG_DIR = path.join(process.cwd(), 'config');
const API_KEYS_PATH = path.join(CONFIG_DIR, 'apiKeys.json');

let apiKeysConfig: Record<string, { rateLimit: RateLimitConfig | null }> = {};

try {
  const rawData = fs.readFileSync(API_KEYS_PATH, 'utf-8');
  apiKeysConfig = JSON.parse(rawData);
  console.log('[Store] Loaded API keys configuration.');
} catch (error) {
  console.error('[Store] Error loading API keys configuration:', error);
  // ここで処理を停止するか、デフォルト値を使うかなどを検討
}

// --- 状態管理 ---
const rateLimitStates = new Map<string, RateLimitState>();
const logs: LogEntry[] = [];
const MAX_LOG_ENTRIES = 100; // 保持する最大ログ数

// --- APIキー関連 --- //

export function getApiKeyInfo(apiKey: string): ApiKeyInfo | undefined {
  if (apiKeysConfig[apiKey]) {
    return {
      apiKey: apiKey,
      rateLimit: apiKeysConfig[apiKey].rateLimit,
    };
  }
  return undefined;
}

export function getAllApiKeyInfo(): ApiKeyInfo[] {
  return Object.entries(apiKeysConfig).map(([key, value]) => ({
    apiKey: key,
    rateLimit: value.rateLimit,
  }));
}

export function updateApiKeyRateLimit(apiKey: string, newRateLimit: RateLimitConfig | null): boolean {
  if (apiKeysConfig[apiKey]) {
    apiKeysConfig[apiKey].rateLimit = newRateLimit;
    // 必要に応じてファイルにも書き戻すか検討
    // fs.writeFileSync(API_KEYS_PATH, JSON.stringify(apiKeysConfig, null, 2));
    console.log(`[Store] Updated rate limit for API key ${apiKey}:`, newRateLimit);
    // 状態もリセットした方が自然かもしれない
    rateLimitStates.delete(apiKey);
    return true;
  }
  return false;
}

// --- レートリミット関連 --- //

export function checkRateLimit(apiKey: string): { allowed: boolean; remaining: number } {
  const info = getApiKeyInfo(apiKey);
  if (!info || !info.rateLimit) {
    // レートリミット設定がないキーは常に許可
    return { allowed: true, remaining: Infinity };
  }

  const { interval, limit } = info.rateLimit;
  const now = Date.now();
  const state = rateLimitStates.get(apiKey) || { timestamps: [] };

  // 古いタイムスタンプを削除
  state.timestamps = state.timestamps.filter(
    (timestamp) => now - timestamp < interval
  );

  if (state.timestamps.length < limit) {
    state.timestamps.push(now);
    rateLimitStates.set(apiKey, state);
    const remaining = limit - state.timestamps.length;
    console.log(`[Store] Rate limit check for ${apiKey}: Allowed. Remaining: ${remaining}/${limit}`);
    return { allowed: true, remaining };
  } else {
    console.log(`[Store] Rate limit check for ${apiKey}: Denied. Limit: ${limit}/${limit}`);
    return { allowed: false, remaining: 0 };
  }
}

// --- ログ関連 --- //

export function addLog(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logs.unshift(logEntry); // 配列の先頭に追加
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.pop(); // 最大数を超えたら古いものを削除
  }
  // コンソールにも出力 (オプション)
  // console.log('[Log]', logEntry);
}

export function getLogs(): LogEntry[] {
  return [...logs]; // イミュータブルなコピーを返す
}

export function clearLogs(): void {
  logs.length = 0; // 配列を空にする
  console.log('[Store] Cleared in-memory logs.');
}
