// ジョブの作成/更新リクエスト
export type JobRequest = {
  name: string;
  description?: string;
  command: string;
  scheduleType: 'once' | 'interval';
  scheduledAt?: string; // ISO形式の日時文字列
  interval?: number;
  intervalUnit?: 'minute' | 'hour' | 'day';
  isActive?: boolean;
};

// APIレスポンス型
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};
