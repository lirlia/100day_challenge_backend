import { useState, useEffect } from 'react';

const timeAgo = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (isNaN(seconds)) return ''; // 不正な日付文字列の場合

  let interval = seconds / 31536000; // years
  if (interval > 1) return Math.floor(interval) + "年前";
  interval = seconds / 2592000; // months
  if (interval > 1) return Math.floor(interval) + "ヶ月前";
  interval = seconds / 86400; // days
  if (interval > 1) return Math.floor(interval) + "日前";
  interval = seconds / 3600; // hours
  if (interval > 1) return Math.floor(interval) + "時間前";
  interval = seconds / 60; // minutes
  if (interval > 1) return Math.floor(interval) + "分前";
  return Math.max(0, Math.floor(seconds)) + "秒前";
};

export function useTimeAgo(dateString: string): string {
  const [relativeTime, setRelativeTime] = useState(() => timeAgo(dateString));

  useEffect(() => {
    const updateRelativeTime = () => {
      setRelativeTime(timeAgo(dateString));
    };

    // 最初の計算
    updateRelativeTime();

    // 60秒未満なら秒単位で、そうでなければ分単位で更新
    const now = new Date().getTime();
    const past = new Date(dateString).getTime();
    const diffInSeconds = Math.floor((now - past) / 1000);

    let intervalDuration = 60000; // デフォルトは60秒
    if (!isNaN(diffInSeconds) && diffInSeconds < 60) {
      intervalDuration = 1000; // 60秒未満なら1秒ごとに更新
    }

    const intervalId = setInterval(updateRelativeTime, intervalDuration);

    // クリーンアップ
    return () => {
      clearInterval(intervalId);
    };
  }, [dateString]); // dateString が変更されたら再計算

  return relativeTime;
}
