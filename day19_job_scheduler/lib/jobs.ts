import { prisma } from './db';

/**
 * 次回実行時間を計算
 */
export function calculateNextRunTime(
  scheduleType: string,
  scheduledAt: Date | null,
  interval: number | null,
  intervalUnit: string | null
): Date | null {
  const now = new Date();

  if (scheduleType === 'once') {
    // 一回のみの実行の場合、scheduledAtが次回実行時間
    if (!scheduledAt || scheduledAt < now) {
      return null; // 過去の場合はnull
    }
    return scheduledAt;
  } else if (scheduleType === 'interval') {
    // 定期実行の場合、現在時刻 + 間隔
    if (!interval || !intervalUnit) {
      return null;
    }

    const nextTime = new Date(now);

    switch (intervalUnit) {
      case 'minute':
        nextTime.setMinutes(nextTime.getMinutes() + interval);
        break;
      case 'hour':
        nextTime.setHours(nextTime.getHours() + interval);
        break;
      case 'day':
        nextTime.setDate(nextTime.getDate() + interval);
        break;
      default:
        return null;
    }

    return nextTime;
  }

  return null;
}

/**
 * ジョブの実行をシミュレート
 */
export async function simulateJobExecution(jobId: string): Promise<boolean> {
  try {
    // ジョブの実行開始を記録
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || !job.isActive) {
      return false;
    }

    const now = new Date();

    // 実行履歴を作成
    const history = await prisma.jobHistory.create({
      data: {
        jobId,
        startedAt: now,
        status: 'running',
        log: `Job execution started at ${now.toISOString()}`,
      },
    });

    // ジョブの状態を更新
    await prisma.job.update({
      where: { id: jobId },
      data: {
        lastRunAt: now,
      },
    });

    // 実行をシミュレート (成功または失敗をランダムに決定)
    const success = Math.random() > 0.2; // 80%の確率で成功
    const executionTime = 1000 + Math.random() * 5000; // 1~6秒のランダムな実行時間

    // 非同期で実行して結果を保存
    setTimeout(async () => {
      try {
        const finishTime = new Date();
        const status = success ? 'success' : 'failed';
        const log = `Job execution ${status} at ${finishTime.toISOString()}. Execution time: ${executionTime}ms`;

        // 履歴を更新
        await prisma.jobHistory.update({
          where: { id: history.id },
          data: {
            finishedAt: finishTime,
            status,
            log,
          },
        });

        // 次回実行時間を計算して更新
        const nextRunAt = calculateNextRunTime(
          job.scheduleType,
          job.scheduledAt,
          job.interval,
          job.intervalUnit
        );

        await prisma.job.update({
          where: { id: jobId },
          data: {
            nextRunAt,
            // 一回のみのジョブの場合、実行後は無効化
            isActive: job.scheduleType === 'once' ? false : job.isActive,
          },
        });

        console.log(`Job ${jobId} executed with status: ${status}`);
      } catch (error) {
        console.error('Error updating job execution result:', error);
      }
    }, executionTime);

    return true;
  } catch (error) {
    console.error('Error simulating job execution:', error);
    return false;
  }
}

/**
 * 実行期限が来たジョブをチェックして実行
 */
export async function checkAndRunDueJobs(): Promise<number> {
  try {
    const now = new Date();

    // 実行期限が来たアクティブなジョブを検索
    const dueJobs = await prisma.job.findMany({
      where: {
        isActive: true,
        nextRunAt: {
          lte: now,
        },
      },
    });

    console.log(`Found ${dueJobs.length} due jobs to execute`);

    // 各ジョブを実行
    for (const job of dueJobs) {
      await simulateJobExecution(job.id);
    }

    return dueJobs.length;
  } catch (error) {
    console.error('Error checking due jobs:', error);
    return 0;
  }
}
