// APIテスト用のシンプルなスクリプト
import { prisma } from './lib/db';
import { calculateNextRunTime, simulateJobExecution, checkAndRunDueJobs } from './lib/jobs';

async function testGetJobs() {
  try {
    console.log('--- ジョブ一覧の取得 ---');
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
    });

    console.log(JSON.stringify(jobs, null, 2));
    console.log(`合計 ${jobs.length} 件のジョブがあります。`);
    return jobs;
  } catch (error) {
    console.error('ジョブ一覧の取得エラー:', error);
    return [];
  }
}

async function testCreateJob() {
  try {
    console.log('--- 新規ジョブの作成 ---');
    const now = new Date();
    const job = await prisma.job.create({
      data: {
        name: 'テストジョブ' + Math.floor(Math.random() * 1000),
        description: 'APIテスト用ジョブ',
        command: 'echo "test"',
        scheduleType: 'interval',
        interval: 5,
        intervalUnit: 'minute',
        isActive: true,
        nextRunAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
    });

    console.log(JSON.stringify(job, null, 2));
    console.log('ジョブが正常に作成されました。');
    return job;
  } catch (error) {
    console.error('ジョブ作成エラー:', error);
    return null;
  }
}

async function testGetJobById(id: string) {
  try {
    console.log(`--- ジョブ詳細の取得 (ID: ${id}) ---`);
    const job = await prisma.job.findUnique({
      where: { id },
    });

    console.log(JSON.stringify(job, null, 2));
    return job;
  } catch (error) {
    console.error(`ジョブ詳細の取得エラー:`, error);
    return null;
  }
}

async function testUpdateJob(id: string) {
  try {
    console.log(`--- ジョブの更新 (ID: ${id}) ---`);
    const job = await prisma.job.update({
      where: { id },
      data: {
        name: 'Updated: ' + Math.floor(Math.random() * 1000),
        description: '更新されたジョブです',
      },
    });

    console.log(JSON.stringify(job, null, 2));
    console.log('ジョブが正常に更新されました。');
    return job;
  } catch (error) {
    console.error(`ジョブ更新エラー:`, error);
    return null;
  }
}

async function testToggleJob(id: string) {
  try {
    console.log(`--- ジョブの有効/無効切り替え (ID: ${id}) ---`);
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      console.error(`ジョブが見つかりません: ${id}`);
      return null;
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        isActive: !job.isActive,
      },
    });

    console.log(JSON.stringify(updatedJob, null, 2));
    console.log(`ジョブを ${updatedJob.isActive ? '有効' : '無効'} に切り替えました。`);
    return updatedJob;
  } catch (error) {
    console.error(`ジョブ切り替えエラー:`, error);
    return null;
  }
}

async function testRunJob(id: string) {
  try {
    console.log(`--- ジョブの手動実行 (ID: ${id}) ---`);
    const success = await simulateJobExecution(id);

    console.log(`ジョブの実行: ${success ? '成功' : '失敗'}`);

    // 少し待ってから履歴を取得
    await new Promise(resolve => setTimeout(resolve, 500));

    const history = await prisma.jobHistory.findMany({
      where: { jobId: id },
      orderBy: { startedAt: 'desc' },
      take: 1,
    });

    console.log('最新の実行履歴:');
    console.log(JSON.stringify(history[0], null, 2));

    return history[0];
  } catch (error) {
    console.error(`ジョブ実行エラー:`, error);
    return null;
  }
}

async function testGetJobHistory(id: string) {
  try {
    console.log(`--- ジョブの実行履歴 (ID: ${id}) ---`);
    const history = await prisma.jobHistory.findMany({
      where: { jobId: id },
      orderBy: { startedAt: 'desc' },
    });

    console.log(JSON.stringify(history, null, 2));
    console.log(`合計 ${history.length} 件の履歴があります。`);

    return history;
  } catch (error) {
    console.error(`履歴取得エラー:`, error);
    return [];
  }
}

async function testCheckScheduler() {
  try {
    console.log('--- スケジューラのチェック ---');
    const count = await checkAndRunDueJobs();

    console.log(`${count} 件のジョブが実行されました。`);
    return count;
  } catch (error) {
    console.error(`スケジューラチェックエラー:`, error);
    return 0;
  }
}

async function runTests() {
  try {
    // 既存のジョブを取得
    const jobs = await testGetJobs();

    // 新しいジョブを作成
    const newJob = await testCreateJob();

    if (newJob) {
      // ジョブの詳細を取得
      await testGetJobById(newJob.id);

      // ジョブを更新
      await testUpdateJob(newJob.id);

      // ジョブを実行
      await testRunJob(newJob.id);

      // ジョブの履歴を取得
      await testGetJobHistory(newJob.id);

      // ジョブの有効/無効を切り替え
      await testToggleJob(newJob.id);
    }

    // スケジューラのチェック
    await testCheckScheduler();

    console.log('すべてのテストが完了しました。');
  } catch (error) {
    console.error('テスト実行中にエラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// テスト実行
runTests();
