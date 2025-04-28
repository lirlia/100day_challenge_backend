import { prisma } from './db';

/**
 * 次回実行時間を計算する
 */
export function calculateNextRunTime(
  scheduleType: string,
  scheduledAt: Date | null,
  interval: number | null,
  intervalUnit: string | null
): Date {
  const now = new Date();

  if (scheduleType === 'once' && scheduledAt) {
    return scheduledAt;
  }

  if (scheduleType === 'interval' && interval && intervalUnit) {
    const nextRun = new Date();

    // 間隔単位に応じて次回実行時間を設定
    switch (intervalUnit) {
      case 'second':
        nextRun.setSeconds(nextRun.getSeconds() + interval);
        break;
      case 'minute':
        nextRun.setMinutes(nextRun.getMinutes() + interval);
        break;
      case 'hour':
        nextRun.setHours(nextRun.getHours() + interval);
        break;
      case 'day':
        nextRun.setDate(nextRun.getDate() + interval);
        break;
    }

    return nextRun;
  }

  // デフォルトは現在時刻から5分後
  now.setMinutes(now.getMinutes() + 5);
  return now;
}

/**
 * 実行時間を過ぎたジョブを検索して実行する
 */
export async function checkAndRunDueJobs(): Promise<number> {
  const now = new Date();

  // 実行時間を過ぎた有効なジョブを検索
  const dueJobs = await prisma.job.findMany({
    where: {
      isActive: true,
      nextRunAt: {
        lte: now,
      },
    },
  });

  console.log(`Found ${dueJobs.length} due jobs to execute`);

  // 各ジョブを非同期で実行
  const promises = dueJobs.map(async (job) => {
    await simulateJobExecution(job.id);

    // 次回実行時間を更新
    if (job.scheduleType === 'interval') {
      await updateNextRunTime(job);
    } else {
      // 一回のみ実行の場合は無効化
      await prisma.job.update({
        where: { id: job.id },
        data: {
          isActive: false,
        },
      });
    }
  });

  await Promise.all(promises);
  return dueJobs.length;
}

/**
 * 次回実行時間を更新する
 */
async function updateNextRunTime(job: any) {
  const nextRunAt = calculateNextRunTime(
    job.scheduleType,
    job.scheduledAt,
    job.interval,
    job.intervalUnit
  );

  await prisma.job.update({
    where: { id: job.id },
    data: {
      nextRunAt,
      lastRunAt: new Date(),
    },
  });
}

/**
 * ジョブ実行をシミュレートする
 */
export async function simulateJobExecution(jobId: string): Promise<boolean> {
  try {
    // ジョブが存在するか確認
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      console.error(`Job ${jobId} not found`);
      return false;
    }

    // 実行履歴を作成
    const history = await prisma.jobHistory.create({
      data: {
        jobId,
        startedAt: new Date(),
        status: 'running',
      },
    });

    // ジョブの前回実行時間を更新
    await prisma.job.update({
      where: { id: jobId },
      data: {
        lastRunAt: new Date(),
      },
    });

    // 非同期でジョブを実行（実際の実装ではここで外部コマンドを実行）
    setTimeout(async () => {
      try {
        // 実行成功を模擬（実際のコマンド実行結果に応じて変わる）
        const success = Math.random() > 0.2; // 80%の確率で成功

        // 履歴を更新
        await prisma.jobHistory.update({
          where: { id: history.id },
          data: {
            finishedAt: new Date(),
            status: success ? 'success' : 'failed',
            output: success ? `${job.command} executed successfully` : null,
            error: !success ? `Error executing command: ${job.command}` : null,
          },
        });

        console.log(`Job ${jobId} executed with status: ${success ? 'success' : 'failed'}`);
      } catch (error) {
        console.error(`Error completing job ${jobId}:`, error);

        // エラー時も履歴を更新
        await prisma.jobHistory.update({
          where: { id: history.id },
          data: {
            finishedAt: new Date(),
            status: 'failed',
            error: `Internal error: ${error}`,
          },
        });
      }
    }, 1000); // 1秒後に完了

    return true;
  } catch (error) {
    console.error(`Error executing job ${jobId}:`, error);
    return false;
  }
}
